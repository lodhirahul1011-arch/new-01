import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import {
  mediaDevices,
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
} from 'react-native-webrtc';
import {
  check,
  request,
  PERMISSIONS,
  RESULTS,
  type Permission,
} from 'react-native-permissions';

import {
  useEndTabletCallMutation,
  useLazyGetTabletCallQuery,
  useLazyGetTabletCallSignalingQuery,
  useSendTabletCallSignalMutation,
} from '../../../services/api/tabletCallsApi';
import { subscribeToUserTabletEvents } from '../../../services/realtime/tabletRealtime';
import { useAppSelector } from '../../../store/hooks';
import {
  activateCallEarpieceRoute,
  activateCallSpeakerRoute,
  releaseLiveFeedAudioRoute,
} from '../../liveFeed/audioRoute';
import { normalizeWebRtcSdp } from '../../liveFeed/sdp';
import type { TabletIceCandidate } from '../../liveFeed/types';
import { logs } from '../../../services/logs';
import { API_BASE_URL } from '../../../config/env';

type AudioCallState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'ended'
  | 'error';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];
const FAST_POLL_MS = 40;
const NEGOTIATION_POLL_MS = 220;
const CONNECTED_POLL_MS = 650;
const RETRY_MS = 700;
const REALTIME_RETRY_MS = 1200;
const TERMINAL_CALL_STATES = new Set(['declined', 'ended', 'missed', 'failed', 'paused']);

function buildIceKey(candidate: TabletIceCandidate) {
  return [
    candidate.from || '',
    candidate.sdpMid || '',
    candidate.sdpMLineIndex ?? '',
    candidate.candidate || '',
  ].join('|');
}

function isPeerConnectionClosed(pc: RTCPeerConnection | null) {
  if (!pc) {
    return true;
  }

  return pc.signalingState === 'closed' || (pc as any).connectionState === 'closed';
}

export function useTabletAudioCall(callId: string) {
  const accessToken = useAppSelector(state => state.auth.accessToken);
  const [callState, setCallState] = useState<AudioCallState>('connecting');
  const [errorMessage, setErrorMessage] = useState('');
  const [isMicrophoneEnabled, setIsMicrophoneEnabled] = useState(true);
  const [isSpeakerEnabled, setIsSpeakerEnabled] = useState(false);

  const [fetchCall] = useLazyGetTabletCallQuery();
  const [fetchSignaling] = useLazyGetTabletCallSignalingQuery();
  const [sendSignal] = useSendTabletCallSignalMutation();
  const [endCallMutation] = useEndTabletCallMutation();

  const stoppedRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localAudioStreamRef = useRef<MediaStream | null>(null);
  const sentOfferSdpRef = useRef('');
  const appliedAnswerSdpRef = useRef('');
  const appliedRemoteIceRef = useRef<Set<string>>(new Set());
  const pendingLocalIceRef = useRef<any[]>([]);
  const sendingIceRef = useRef(false);
  const hasMicrophonePermissionRef = useRef(Platform.OS !== 'android');
  const microphoneEnabledRef = useRef(true);
  const speakerEnabledRef = useRef(false);

  const schedulePoll = useCallback((delayMs: number) => {
    if (stoppedRef.current) {
      logs.info('[AudioCall][Mobile] skipping poll schedule after stop', { callId });
      return;
    }

    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
    }

    pollTimerRef.current = setTimeout(() => {
      pollCallRef.current?.().catch(error => {
        logs.error('[AudioCall][Mobile] scheduled poll failed', String(error));
      });
    }, delayMs);
  }, [callId]);

  const stopLocalStream = useCallback(() => {
    const stream = localAudioStreamRef.current;
    if (!stream) {
      return;
    }

    try {
      stream.getTracks().forEach(track => track.stop());
    } catch {
      // ignore cleanup errors
    }

    localAudioStreamRef.current = null;
  }, []);

  const ensureMicrophonePermission = useCallback(async () => {
    if (Platform.OS === 'ios') {
      try {
        const microphonePermission = PERMISSIONS.IOS.MICROPHONE as Permission;
        let status = await check(microphonePermission);
        if (status === RESULTS.DENIED) {
          status = await request(microphonePermission);
        }

        const granted = status === RESULTS.GRANTED;
        hasMicrophonePermissionRef.current = granted;
        logs.info('[AudioCall][Mobile] iOS microphone permission checked', status);
        return granted;
      } catch (error) {
        hasMicrophonePermissionRef.current = false;
        logs.error('[AudioCall][Mobile] iOS microphone permission failed', String(error));
        return false;
      }
    }

    if (Platform.OS !== 'android') {
      logs.info('[AudioCall][Mobile] microphone permission assumed for platform', Platform.OS);
      hasMicrophonePermissionRef.current = true;
      return true;
    }

    if (hasMicrophonePermissionRef.current) {
      return true;
    }

    try {
      const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
      let granted = await PermissionsAndroid.check(permission);

      if (!granted) {
        const result = await PermissionsAndroid.request(permission);
        granted = result === PermissionsAndroid.RESULTS.GRANTED;
      }

      hasMicrophonePermissionRef.current = granted;
      logs.info('[AudioCall][Mobile] Android microphone permission checked', String(granted));
      return granted;
    } catch (error) {
      hasMicrophonePermissionRef.current = false;
      logs.error('[AudioCall][Mobile] Android microphone permission failed', String(error));
      return false;
    }
  }, []);

  const ensureLocalAudioStream = useCallback(async () => {
    if (localAudioStreamRef.current) {
      return localAudioStreamRef.current;
    }

    const hasPermission = await ensureMicrophonePermission();
    if (!hasPermission) {
      return null;
    }

    try {
      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      stream.getAudioTracks().forEach(track => {
        track.enabled = microphoneEnabledRef.current;
      });

      localAudioStreamRef.current = stream;
      logs.info('[AudioCall][Mobile] local microphone stream opened', Platform.OS);
      return stream;
    } catch (error) {
      logs.error('[AudioCall][Mobile] Unable to open microphone', String(error));
      return null;
    }
  }, [ensureMicrophonePermission]);

  const closePeerConnection = useCallback(() => {
    const pc = peerConnectionRef.current;
    if (pc) {
      try {
        const eventTarget = pc as any;
        const iceHandler = eventTarget.__audioCallIceHandler;
        const trackHandler = eventTarget.__audioCallTrackHandler;
        const connectionHandler = eventTarget.__audioCallConnectionHandler;

        if (iceHandler) {
          eventTarget.removeEventListener('icecandidate', iceHandler);
        }
        if (trackHandler) {
          eventTarget.removeEventListener('track', trackHandler);
        }
        if (connectionHandler) {
          eventTarget.removeEventListener('connectionstatechange', connectionHandler);
          eventTarget.removeEventListener('iceconnectionstatechange', connectionHandler);
        }

        pc.close();
      } catch {
        // ignore cleanup errors
      }
    }

    peerConnectionRef.current = null;
    sentOfferSdpRef.current = '';
    appliedAnswerSdpRef.current = '';
    appliedRemoteIceRef.current.clear();
    pendingLocalIceRef.current = [];
    sendingIceRef.current = false;
    stopLocalStream();
    releaseLiveFeedAudioRoute();
  }, [stopLocalStream]);

  const flushLocalIceQueue = useCallback(async () => {
    if (sendingIceRef.current || stoppedRef.current) {
      logs.info('[AudioCall][Mobile] skipping local ICE flush', {
        callId,
        stopped: stoppedRef.current,
      });
      return;
    }

    sendingIceRef.current = true;
    try {
      while (pendingLocalIceRef.current.length > 0 && !stoppedRef.current) {
        const next = pendingLocalIceRef.current[0];
        await sendSignal({ callId, body: next }).unwrap();
        pendingLocalIceRef.current.shift();
      }
    } catch {
      setCallState(current => (current === 'connected' ? 'reconnecting' : current));
      schedulePoll(RETRY_MS);
    } finally {
      sendingIceRef.current = false;
    }
  }, [callId, schedulePoll, sendSignal]);

  const ensurePeerConnection = useCallback(() => {
    if (peerConnectionRef.current && !isPeerConnectionClosed(peerConnectionRef.current)) {
      return peerConnectionRef.current;
    }

    if (peerConnectionRef.current) {
      logs.info('[AudioCall][Mobile] replacing closed peer connection', { callId });
      peerConnectionRef.current = null;
    }

    logs.info('[AudioCall][Mobile] creating peer connection', { callId });
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const eventTarget = pc as any;

    const handleIceCandidate = (event: any) => {
      if (!event.candidate) {
        return;
      }

      pendingLocalIceRef.current.push({
        signalType: 'ice_candidate',
        candidate: event.candidate.candidate || '',
        sdpMid: event.candidate.sdpMid || '',
        sdpMLineIndex:
          typeof event.candidate.sdpMLineIndex === 'number'
            ? event.candidate.sdpMLineIndex
            : undefined,
      });
      flushLocalIceQueue().catch(error => {
        logs.error('[AudioCall][Mobile] failed to flush local ICE queue', String(error));
      });
    };

    const handleTrack = (event: any) => {
      const stream = event.streams?.[0];
      if (stream) {
        if (speakerEnabledRef.current) {
          activateCallSpeakerRoute();
        } else {
          activateCallEarpieceRoute();
        }
      }
      setCallState('connected');
      setErrorMessage('');
    };

    const handleConnectionState = () => {
      if (stoppedRef.current) {
        logs.info('[AudioCall][Mobile] ignoring connection state after stop', { callId });
        return;
      }

      const connectionState = pc.connectionState;
      const iceState = (pc as any).iceConnectionState;

      if (
        connectionState === 'connected' ||
        iceState === 'connected' ||
        iceState === 'completed'
      ) {
        setCallState('connected');
        setErrorMessage('');
        return;
      }

      if (
        connectionState === 'failed' ||
        connectionState === 'closed' ||
        iceState === 'failed'
      ) {
        setCallState('reconnecting');
        schedulePoll(RETRY_MS);
      }
    };

    eventTarget.addEventListener('icecandidate', handleIceCandidate);
    eventTarget.addEventListener('track', handleTrack);
    eventTarget.addEventListener('connectionstatechange', handleConnectionState);
    eventTarget.addEventListener('iceconnectionstatechange', handleConnectionState);
    eventTarget.__audioCallIceHandler = handleIceCandidate;
    eventTarget.__audioCallTrackHandler = handleTrack;
    eventTarget.__audioCallConnectionHandler = handleConnectionState;

    peerConnectionRef.current = pc;
    return pc;
  }, [callId, flushLocalIceQueue, schedulePoll]);

  const applyRemoteIce = useCallback(async (pc: RTCPeerConnection, candidates: TabletIceCandidate[]) => {
    for (const candidate of candidates) {
      if (candidate.from !== 'tablet' || !candidate.candidate) {
        continue;
      }

      const key = buildIceKey(candidate);
      if (appliedRemoteIceRef.current.has(key)) {
        continue;
      }

      try {
        await pc.addIceCandidate(
          new RTCIceCandidate({
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid || undefined,
            sdpMLineIndex:
              typeof candidate.sdpMLineIndex === 'number'
                ? candidate.sdpMLineIndex
                : undefined,
          }),
        );
        appliedRemoteIceRef.current.add(key);
      } catch {
        // try again on later poll
      }
    }
  }, []);

  const pollCallRef = useRef<null | (() => Promise<void>)>(null);

  const fetchCallFresh = useCallback(async () => {
    const token = String(accessToken || '').trim();
    if (!token) {
      return fetchCall({ callId }).unwrap();
    }

    const response = await fetch(
      `${API_BASE_URL}/api/v1/tablet/calls/${encodeURIComponent(callId)}?t=${Date.now()}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      },
    );

    if (!response.ok) {
      logs.error('[AudioCall][Mobile] fresh call state request failed', {
        callId,
        status: response.status,
      });
      throw new Error(`fresh_call_state_failed_${response.status}`);
    }

    const payload = await response.json();
    return payload?.data;
  }, [accessToken, callId, fetchCall]);

  const endCall = useCallback(async (reason = 'mobile_audio_cleanup') => {
    stoppedRef.current = true;
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
    }
    if (realtimeRetryRef.current) {
      clearTimeout(realtimeRetryRef.current);
    }
    closePeerConnection();
    try {
      await endCallMutation({ callId, reason }).unwrap();
    } catch {
      // best-effort shutdown
    }
  }, [callId, closePeerConnection, endCallMutation]);

  const toggleMicrophone = useCallback(() => {
    const next = !microphoneEnabledRef.current;
    microphoneEnabledRef.current = next;
    setIsMicrophoneEnabled(next);
    localAudioStreamRef.current?.getAudioTracks().forEach(track => {
      track.enabled = next;
    });
  }, []);

  const toggleSpeaker = useCallback(() => {
    const next = !speakerEnabledRef.current;
    speakerEnabledRef.current = next;
    setIsSpeakerEnabled(next);
    if (next) {
      activateCallSpeakerRoute();
    } else {
      activateCallEarpieceRoute();
    }
  }, []);

  const pollCall = useCallback(async () => {
    if (stoppedRef.current) {
      logs.info('[AudioCall][Mobile] skipping poll after stop', { callId });
      return;
    }

    try {
      const call = await fetchCallFresh();
      if (stoppedRef.current) {
        logs.info('[AudioCall][Mobile] stopping poll after fresh call fetch', { callId });
        return;
      }

      if (TERMINAL_CALL_STATES.has(call.state || '')) {
        logs.info('[AudioCall][Mobile] remote tablet call ended', {
          callId,
          state: call.state,
        });
        stoppedRef.current = true;
        if (pollTimerRef.current) {
          clearTimeout(pollTimerRef.current);
        }
        setCallState('ended');
        closePeerConnection();
        return;
      }

      const signaling = await fetchSignaling({ callId }).unwrap();
      if (stoppedRef.current) {
        logs.info('[AudioCall][Mobile] stopping poll after signaling fetch', { callId });
        return;
      }

      const pc = ensurePeerConnection();
      const localStream = await ensureLocalAudioStream();
      if (stoppedRef.current || isPeerConnectionClosed(pc)) {
        logs.info('[AudioCall][Mobile] stopping poll before offer because call closed', {
          callId,
          stopped: stoppedRef.current,
          signalingState: pc.signalingState,
          connectionState: (pc as any).connectionState,
        });
        return;
      }
      if (!localStream) {
        setCallState('error');
        setErrorMessage('Microphone permission is required for the audio call.');
        return;
      }

      const existingTrackIds = new Set(
        pc.getSenders().map(sender => sender.track?.id).filter(Boolean),
      );
      localStream.getAudioTracks().forEach(track => {
        if (!existingTrackIds.has(track.id)) {
          pc.addTrack(track, localStream);
        }
      });

      if (!sentOfferSdpRef.current) {
        if (isPeerConnectionClosed(pc)) {
          logs.info('[AudioCall][Mobile] skipping offer on closed peer connection', { callId });
          return;
        }
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: false,
        } as any);
        if (stoppedRef.current || isPeerConnectionClosed(pc)) {
          logs.info('[AudioCall][Mobile] stopping poll before local description', {
            callId,
            stopped: stoppedRef.current,
          });
          return;
        }
        await pc.setLocalDescription(offer);
        const normalizedOfferSdp = normalizeWebRtcSdp(
          pc.localDescription?.sdp || offer.sdp || '',
        );
        await sendSignal({
          callId,
          body: {
            signalType: 'offer',
            sdp: normalizedOfferSdp,
          },
        }).unwrap();
        sentOfferSdpRef.current = normalizedOfferSdp || '__empty_offer__';
        setCallState('connecting');
        schedulePoll(NEGOTIATION_POLL_MS);
        return;
      }

      if (signaling.answerSdp && appliedAnswerSdpRef.current !== signaling.answerSdp) {
        if (isPeerConnectionClosed(pc)) {
          logs.info('[AudioCall][Mobile] skipping answer on closed peer connection', { callId });
          return;
        }
        await pc.setRemoteDescription({
          type: 'answer',
          sdp: normalizeWebRtcSdp(signaling.answerSdp),
        });
        appliedAnswerSdpRef.current = signaling.answerSdp;
        setCallState('connected');
        setErrorMessage('');
        if (speakerEnabledRef.current) {
          activateCallSpeakerRoute();
        } else {
          activateCallEarpieceRoute();
        }
      }

      await flushLocalIceQueue();
      await applyRemoteIce(pc, signaling.iceCandidates || []);
      schedulePoll(call.state === 'answered' ? CONNECTED_POLL_MS : NEGOTIATION_POLL_MS);
    } catch (error) {
      if (stoppedRef.current) {
        logs.info('[AudioCall][Mobile] ignoring poll failure after stop', {
          callId,
          error: String(error),
        });
        return;
      }
      logs.error('[AudioCall][Mobile] Poll failed', String(error));
      setCallState(current => (current === 'connected' ? 'reconnecting' : 'connecting'));
      setErrorMessage('Trying to reconnect audio call...');
      schedulePoll(RETRY_MS);
    }
  }, [applyRemoteIce, callId, closePeerConnection, ensureLocalAudioStream, ensurePeerConnection, fetchCallFresh, fetchSignaling, flushLocalIceQueue, schedulePoll, sendSignal]);

  pollCallRef.current = pollCall;

  useEffect(() => {
    stoppedRef.current = false;
    activateCallEarpieceRoute();
    ensureMicrophonePermission().catch(error => {
      logs.error('[AudioCall][Mobile] microphone permission check failed', String(error));
    });
    pollCall().catch(error => {
      logs.error('[AudioCall][Mobile] initial poll failed', String(error));
    });

    return () => {
      stoppedRef.current = true;
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
      if (realtimeRetryRef.current) {
        clearTimeout(realtimeRetryRef.current);
      }
      closePeerConnection();
    };
  }, [closePeerConnection, ensureMicrophonePermission, pollCall]);

  useEffect(() => {
    const token = String(accessToken || '').trim();
    if (!token || !callId) {
      return;
    }

    let unsubscribe: (() => void) | undefined;
    let closed = false;

    const connect = () => {
      if (closed || stoppedRef.current) {
        return;
      }

      unsubscribe = subscribeToUserTabletEvents({
        accessToken: token,
        onEvent: evt => {
          const evtCallId = String(evt?.data?.callId || evt?.data?.call?._id || evt?.data?.call?.id || '');
          if (evtCallId && evtCallId !== callId) {
            return;
          }

          if (
            evt.event === 'tablet.call.ended' ||
            evt.event === 'tablet.call.rejected' ||
            evt.event === 'tablet.call.paused'
          ) {
            logs.info('[AudioCall][Mobile] realtime call terminal event received', {
              callId,
              event: evt.event,
            });
            stoppedRef.current = true;
            if (pollTimerRef.current) {
              clearTimeout(pollTimerRef.current);
            }
            setCallState('ended');
            closePeerConnection();
            return;
          }

          if (evt.event === 'tablet.call.answered') {
            setCallState('connecting');
            schedulePoll(FAST_POLL_MS);
            return;
          }

          if (evt.event === 'tablet.call.signal') {
            schedulePoll(FAST_POLL_MS);
          }
        },
        onError: () => {
          if (closed || stoppedRef.current) {
            return;
          }
          if (realtimeRetryRef.current) {
            clearTimeout(realtimeRetryRef.current);
          }
          realtimeRetryRef.current = setTimeout(connect, REALTIME_RETRY_MS);
        },
      });
    };

    connect();

    return () => {
      closed = true;
      if (realtimeRetryRef.current) {
        clearTimeout(realtimeRetryRef.current);
      }
      unsubscribe?.();
    };
  }, [accessToken, callId, closePeerConnection, schedulePoll]);

  return {
    callState,
    errorMessage,
    isMicrophoneEnabled,
    isSpeakerEnabled,
    toggleMicrophone,
    toggleSpeaker,
    endCall,
  };
}
