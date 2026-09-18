import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  PermissionsAndroid,
  Platform,
  type AppStateStatus,
} from 'react-native';
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
  useEndLiveFeedSessionMutation,
  useLazyGetLiveFeedSessionQuery,
  useSendLiveFeedSignalMutation,
  useStartLiveFeedSessionMutation,
} from '../../services/api/liveFeedApi';
import {
  activateLiveFeedAudioRoute,
  releaseLiveFeedAudioRoute,
} from './audioRoute';
import { normalizeWebRtcSdp } from './sdp';
import { logs } from '../../services/logs';
import type {
  LiveFeedViewerState,
  TabletIceCandidate,
  TabletLiveFeedSession,
  TabletSignalPayload,
} from './types';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];
const NEGOTIATION_POLL_MS = 300;
const LIVE_POLL_MS = 1500;
const RETRY_MS = 1000;

function buildIceKey(candidate: TabletIceCandidate) {
  return [
    candidate.from || '',
    candidate.sdpMid || '',
    candidate.sdpMLineIndex ?? '',
    candidate.candidate || '',
  ].join('|');
}

function getErrorMessage(error: unknown) {
  const maybeError = error as
    | { data?: { message?: string }; message?: string }
    | undefined;

  return (
    maybeError?.data?.message ||
    maybeError?.message ||
    'Unable to start live feed right now.'
  );
}

export function useTabletLiveFeed() {
  const [viewerState, setViewerState] = useState<LiveFeedViewerState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [remoteStreamUrl, setRemoteStreamUrl] = useState('');
  const [isMicrophoneEnabled, setIsMicrophoneEnabled] = useState(true);
  const [isSpeakerEnabled, setIsSpeakerEnabled] = useState(true);

  const [startSession] = useStartLiveFeedSessionMutation();
  const [fetchSession] = useLazyGetLiveFeedSessionQuery();
  const [sendSignal] = useSendLiveFeedSignalMutation();
  const [endSession] = useEndLiveFeedSessionMutation();

  const stoppedRef = useRef(false);
  const pollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollSessionRef = useRef<(() => Promise<void>) | null>(null);
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localAudioStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const activeCallIdRef = useRef<string | null>(null);
  const sentOfferSdpRef = useRef('');
  const appliedAnswerSdpRef = useRef('');
  const appliedRemoteIceRef = useRef<Set<string>>(new Set());
  const pendingLocalIceRef = useRef<TabletSignalPayload[]>([]);
  const sendingLocalIceRef = useRef(false);
  const startInFlightRef = useRef(false);
  const restartInFlightRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const hasMicrophonePermissionRef = useRef(Platform.OS !== 'android');
  const microphoneEnabledRef = useRef(true);
  const speakerEnabledRef = useRef(true);
  const remoteVideoReadyRef = useRef(false);
  const [streamRenderKey, setStreamRenderKey] = useState(0);

  const schedulePoll = useCallback((delayMs: number) => {
    if (stoppedRef.current) {
      return;
    }

    if (pollingTimerRef.current) {
      clearTimeout(pollingTimerRef.current);
    }

    pollingTimerRef.current = setTimeout(() => {
      void pollSessionRef.current?.();
    }, delayMs);
  }, []);

  const stopLocalAudioStream = useCallback(() => {
    const stream = localAudioStreamRef.current;
    if (!stream) {
      return;
    }

    try {
      stream.getTracks().forEach(track => track.stop());
    } catch {
      // ignore local audio cleanup errors
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
        logs.info('[LiveFeed][Mobile] iOS microphone permission checked', status);
        return granted;
      } catch (error) {
        hasMicrophonePermissionRef.current = false;
        logs.error('[LiveFeed][Mobile] iOS microphone permission failed', String(error));
        return false;
      }
    }

    if (Platform.OS !== 'android') {
      logs.info('[LiveFeed][Mobile] microphone permission assumed for platform', Platform.OS);
      hasMicrophonePermissionRef.current = true;
      return true;
    }

    if (hasMicrophonePermissionRef.current) {
      return true;
    }

    try {
      let granted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      );

      if (!granted) {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        );
        granted = result === PermissionsAndroid.RESULTS.GRANTED;
      }

      hasMicrophonePermissionRef.current = granted;
      logs.info('[LiveFeed][Mobile] Android microphone permission checked', String(granted));
      return granted;
    } catch (error) {
      hasMicrophonePermissionRef.current = false;
      logs.error('[LiveFeed][Mobile] Android microphone permission failed', String(error));
      return false;
    }
  }, []);

  const ensureBluetoothConnectPermission = useCallback(async () => {
    if (Platform.OS !== 'android' || Number(Platform.Version) < 31) {
      return true;
    }

    const permission = (PermissionsAndroid.PERMISSIONS as Record<string, string>)
      .BLUETOOTH_CONNECT;

    if (!permission) {
      logs.info('[LiveFeed][Mobile] Bluetooth connect permission key unavailable');
      return true;
    }

    try {
      const bluetoothPermission = permission as Parameters<typeof PermissionsAndroid.check>[0];
      const alreadyGranted = await PermissionsAndroid.check(bluetoothPermission);
      if (alreadyGranted) {
        return true;
      }

      const result = await PermissionsAndroid.request(bluetoothPermission);
      return result === PermissionsAndroid.RESULTS.GRANTED;
    } catch (error) {
      logs.error('[LiveFeed][Mobile] Bluetooth connect permission failed', String(error));
      return false;
    }
  }, []);

  const activatePreferredAudioRoute = useCallback(() => {
    void ensureBluetoothConnectPermission().finally(() => {
      activateLiveFeedAudioRoute();
    });
  }, [ensureBluetoothConnectPermission]);

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
      logs.info('[LiveFeed][Mobile] local microphone stream opened', Platform.OS);
      return stream;
    } catch (error) {
      logs.error('[LiveFeed][Mobile] Unable to open local microphone', String(error));
      return null;
    }
  }, [ensureMicrophonePermission]);

  const closePeerConnection = useCallback(() => {
    if (disconnectTimerRef.current) {
      clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
    }

    if (videoWatchdogRef.current) {
      clearTimeout(videoWatchdogRef.current);
      videoWatchdogRef.current = null;
    }

    const pc = peerConnectionRef.current;
    if (pc) {
      try {
        const eventTarget = pc as any;
        const iceHandler = eventTarget.__liveFeedIceHandler;
        const trackHandler = eventTarget.__liveFeedTrackHandler;
        const addStreamHandler = eventTarget.__liveFeedAddStreamHandler;
        const connectionHandler = eventTarget.__liveFeedConnectionHandler;

        if (iceHandler) {
          eventTarget.removeEventListener('icecandidate', iceHandler);
        }

        if (trackHandler) {
          eventTarget.removeEventListener('track', trackHandler);
        }

        if (addStreamHandler) {
          eventTarget.removeEventListener('addstream', addStreamHandler);
        }

        if (connectionHandler) {
          eventTarget.removeEventListener(
            'connectionstatechange',
            connectionHandler,
          );
          eventTarget.removeEventListener(
            'iceconnectionstatechange',
            connectionHandler,
          );
        }

        pc.close();
      } catch {
        // ignore cleanup errors
      }
    }

    peerConnectionRef.current = null;
    remoteStreamRef.current = null;
    activeCallIdRef.current = null;
    sentOfferSdpRef.current = '';
    appliedAnswerSdpRef.current = '';
    appliedRemoteIceRef.current.clear();
    pendingLocalIceRef.current = [];
    sendingLocalIceRef.current = false;
    remoteVideoReadyRef.current = false;
    setRemoteStreamUrl('');
    stopLocalAudioStream();
    releaseLiveFeedAudioRoute();
  }, [stopLocalAudioStream]);

  const teardownSession = useCallback(
    async (reason: string, notifyBackend: boolean) => {
      const callId = activeCallIdRef.current;
      closePeerConnection();

      if (!notifyBackend || !callId) {
        return;
      }

      try {
        await endSession({ callId, reason }).unwrap();
      } catch {
        // best-effort shutdown
      }
    },
    [closePeerConnection, endSession],
  );

  const restartSession = useCallback(
    async (reason: string) => {
      if (restartInFlightRef.current || stoppedRef.current) {
        return;
      }

      restartInFlightRef.current = true;
      setViewerState('reconnecting');
      await teardownSession(reason, true);
      restartInFlightRef.current = false;
      schedulePoll(250);
    },
    [schedulePoll, teardownSession],
  );

  const attachLocalAudioStream = useCallback(
    (pc: RTCPeerConnection, localAudioStream: MediaStream) => {
      const existingTrackIds = new Set(
        pc.getSenders()
          .map(sender => sender.track?.id)
          .filter(Boolean),
      );

      localAudioStream.getAudioTracks().forEach(track => {
        if (existingTrackIds.has(track.id)) {
          return;
        }

        pc.addTrack(track, localAudioStream);
      });
    },
    [],
  );

  const toggleMicrophone = useCallback(() => {
    const nextEnabled = !microphoneEnabledRef.current;
    microphoneEnabledRef.current = nextEnabled;
    setIsMicrophoneEnabled(nextEnabled);

    localAudioStreamRef.current?.getAudioTracks().forEach(track => {
      track.enabled = nextEnabled;
    });
  }, []);

  const toggleSpeaker = useCallback(() => {
    const nextEnabled = !speakerEnabledRef.current;
    speakerEnabledRef.current = nextEnabled;
    setIsSpeakerEnabled(nextEnabled);

    if (nextEnabled) {
      activatePreferredAudioRoute();
    }

    remoteStreamRef.current?.getAudioTracks().forEach((track: any) => {
      track.enabled = nextEnabled;
      track._setVolume?.(nextEnabled ? 10 : 0);
    });
  }, [activatePreferredAudioRoute]);

  const flushLocalIceQueue = useCallback(
    async (callId: string) => {
      if (sendingLocalIceRef.current || stoppedRef.current) {
        return;
      }

      sendingLocalIceRef.current = true;

      try {
        while (
          pendingLocalIceRef.current.length > 0 &&
          activeCallIdRef.current === callId &&
          !stoppedRef.current
        ) {
          const signal = pendingLocalIceRef.current[0];
          await sendSignal({ callId, body: signal }).unwrap();
          pendingLocalIceRef.current.shift();
        }
      } catch {
        setViewerState(current =>
          current === 'live' ? 'reconnecting' : current,
        );
        schedulePoll(RETRY_MS);
      } finally {
        sendingLocalIceRef.current = false;
      }
    },
    [schedulePoll, sendSignal],
  );

  const ensurePeerConnection = useCallback(
    (callId: string) => {
      if (peerConnectionRef.current) {
        return peerConnectionRef.current;
      }

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const eventTarget = pc as any;

      try {
        (pc as any).addTransceiver?.('video', { direction: 'recvonly' });
      } catch {
        // Some builds may not expose addTransceiver cleanly; the offer can still proceed.
      }

      const handleIceCandidate = (event: any) => {
        if (!event.candidate || activeCallIdRef.current !== callId) {
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
        void flushLocalIceQueue(callId);
      };

      const handleRemoteStream = (incomingStream: any, incomingTrack?: any) => {
        const stream =
          remoteStreamRef.current ||
          incomingStream ||
          new MediaStream();

        if (incomingTrack) {
          const hasTrack = stream
            .getTracks()
            .some((existingTrack: any) => existingTrack.id === incomingTrack.id);

          if (!hasTrack) {
            stream.addTrack(incomingTrack);
          }
        }

        incomingStream?.getTracks?.().forEach((remoteTrack: any) => {
          const hasTrack = stream
            .getTracks()
            .some((existingTrack: any) => existingTrack.id === remoteTrack.id);

          if (!hasTrack) {
            stream.addTrack(remoteTrack);
          }
        });

        if (!stream) {
          return;
        }

        remoteStreamRef.current = stream;
        activatePreferredAudioRoute();
        stream.getAudioTracks().forEach((audioTrack: any) => {
          audioTrack.enabled = speakerEnabledRef.current;
          audioTrack._setVolume?.(speakerEnabledRef.current ? 10 : 0);
        });

        if (
          incomingTrack?.kind !== 'video' &&
          stream.getVideoTracks().length === 0
        ) {
          return;
        }

        remoteVideoReadyRef.current = true;

        if (disconnectTimerRef.current) {
          clearTimeout(disconnectTimerRef.current);
          disconnectTimerRef.current = null;
        }

        if (videoWatchdogRef.current) {
          clearTimeout(videoWatchdogRef.current);
          videoWatchdogRef.current = null;
        }

        setStreamRenderKey(current => current + 1);
        setRemoteStreamUrl(stream.toURL());
        setViewerState('live');
        setErrorMessage('');
      };

      const handleTrack = (event: any) => {
        const track = event.track;
        handleRemoteStream(event.streams?.[0], track);

        event.streams?.slice?.(1)?.forEach((stream: any) => {
          handleRemoteStream(stream);
        });
      };

      const handleAddStream = (event: any) => {
        handleRemoteStream(event.stream);
      };

      const handleConnectionStateChange = () => {
        const connectionState = pc.connectionState;
        const iceState = (pc as any).iceConnectionState;

        if (
          connectionState === 'connected' ||
          iceState === 'connected' ||
          iceState === 'completed'
        ) {
          if (disconnectTimerRef.current) {
            clearTimeout(disconnectTimerRef.current);
            disconnectTimerRef.current = null;
          }
          setViewerState(current =>
            remoteVideoReadyRef.current
              ? 'live'
              : current === 'reconnecting'
                ? 'reconnecting'
                : 'connecting',
          );
          return;
        }

        if (
          connectionState === 'failed' ||
          connectionState === 'closed' ||
          iceState === 'failed'
        ) {
          if (disconnectTimerRef.current) {
            clearTimeout(disconnectTimerRef.current);
            disconnectTimerRef.current = null;
          }
          void restartSession('mobile_live_feed_connection_lost');
          return;
        }

        if (connectionState === 'disconnected' || iceState === 'disconnected') {
          setViewerState(current =>
            current === 'live' ? 'reconnecting' : current,
          );

          if (disconnectTimerRef.current) {
            return;
          }

          disconnectTimerRef.current = setTimeout(() => {
            disconnectTimerRef.current = null;

            if (
              stoppedRef.current ||
              peerConnectionRef.current !== pc ||
              (
                pc.connectionState !== 'disconnected' &&
                (pc as any).iceConnectionState !== 'disconnected'
              )
            ) {
              return;
            }

            void restartSession('mobile_live_feed_connection_lost');
          }, 4000);
        }
      };

      eventTarget.addEventListener('icecandidate', handleIceCandidate);
      eventTarget.addEventListener('track', handleTrack);
      eventTarget.addEventListener('addstream', handleAddStream);
      eventTarget.addEventListener(
        'connectionstatechange',
        handleConnectionStateChange,
      );
      eventTarget.addEventListener(
        'iceconnectionstatechange',
        handleConnectionStateChange,
      );

      eventTarget.__liveFeedIceHandler = handleIceCandidate;
      eventTarget.__liveFeedTrackHandler = handleTrack;
      eventTarget.__liveFeedAddStreamHandler = handleAddStream;
      eventTarget.__liveFeedConnectionHandler = handleConnectionStateChange;

      peerConnectionRef.current = pc;
      return pc;
    },
    [activatePreferredAudioRoute, flushLocalIceQueue, restartSession],
  );

  const applyRemoteIce = useCallback(async (
    pc: RTCPeerConnection,
    candidates: TabletIceCandidate[],
  ) => {
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
        // Ignore until the peer reaches the right state on a later poll.
      }
    }
  }, []);

  const handleActiveSession = useCallback(
    async (session: TabletLiveFeedSession) => {
      const call = session.call;
      const signaling = session.signaling;

      if (!call || !signaling) {
        setViewerState('reconnecting');
        schedulePoll(RETRY_MS);
        return;
      }

      if (activeCallIdRef.current && activeCallIdRef.current !== call.id) {
        closePeerConnection();
      }

      activeCallIdRef.current = call.id;
      const pc = ensurePeerConnection(call.id);

      if (!sentOfferSdpRef.current) {
        const localAudioStream = await ensureLocalAudioStream();
        if (localAudioStream) {
          attachLocalAudioStream(pc, localAudioStream);
        }

        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        } as any);
        await pc.setLocalDescription(offer);
        const normalizedOfferSdp = normalizeWebRtcSdp(
          pc.localDescription?.sdp || offer.sdp || '',
        );
        await sendSignal({
          callId: call.id,
          body: {
            signalType: 'offer',
            sdp: normalizedOfferSdp,
          },
        }).unwrap();
        sentOfferSdpRef.current = normalizedOfferSdp || '__empty_offer__';
        setViewerState('connecting');
        schedulePoll(NEGOTIATION_POLL_MS);
        return;
      }

      if (
        signaling.answerSdp &&
        appliedAnswerSdpRef.current !== signaling.answerSdp
      ) {
        const normalizedAnswerSdp = normalizeWebRtcSdp(signaling.answerSdp);
        await pc.setRemoteDescription({
          type: 'answer',
          sdp: normalizedAnswerSdp,
        });
        appliedAnswerSdpRef.current = signaling.answerSdp;
        setViewerState(remoteVideoReadyRef.current ? 'live' : 'connecting');

        if (!remoteVideoReadyRef.current) {
          if (videoWatchdogRef.current) {
            clearTimeout(videoWatchdogRef.current);
          }

          videoWatchdogRef.current = setTimeout(() => {
            videoWatchdogRef.current = null;

            if (stoppedRef.current || remoteVideoReadyRef.current) {
              return;
            }

            void restartSession('mobile_live_feed_no_remote_video');
          }, 3500);
        }
      }

      await flushLocalIceQueue(call.id);
      await applyRemoteIce(pc, signaling.iceCandidates || []);
      schedulePoll(
        remoteVideoReadyRef.current
          ? LIVE_POLL_MS
          : signaling.answerSdp
            ? 150
            : NEGOTIATION_POLL_MS,
      );
    },
    [
      applyRemoteIce,
      attachLocalAudioStream,
      closePeerConnection,
      ensureLocalAudioStream,
      ensurePeerConnection,
      flushLocalIceQueue,
      restartSession,
      schedulePoll,
      sendSignal,
    ],
  );

  const handleSessionResponse = useCallback(
    async (session: TabletLiveFeedSession) => {
      switch (session.status) {
        case 'no_tablet_linked':
          await teardownSession('no_tablet_linked', false);
          setViewerState('unavailable');
          setErrorMessage('No linked tablet found for live feed.');
          return;

        case 'tablet_offline':
          await teardownSession('tablet_offline', false);
          setViewerState('offline');
          setErrorMessage('Linked tablet is offline right now.');
          schedulePoll(RETRY_MS);
          return;

        case 'tablet_ready':
          setViewerState('reconnecting');
          setErrorMessage('Preparing live feed session...');
          schedulePoll(250);
          return;

        case 'session_paused':
          await teardownSession('tablet_live_feed_paused', false);
          setViewerState('reconnecting');
          setErrorMessage('Tablet camera is busy. Retrying live feed...');
          schedulePoll(RETRY_MS);
          return;

        case 'session_active':
          setErrorMessage('');
          await handleActiveSession(session);
          return;
      }
    },
    [handleActiveSession, schedulePoll, teardownSession],
  );

  const bootstrapSession = useCallback(
    async (mode: LiveFeedViewerState = 'starting') => {
      if (startInFlightRef.current || stoppedRef.current) {
        return;
      }

      startInFlightRef.current = true;
      setViewerState(mode);
      setErrorMessage('');

      try {
        const session = await startSession().unwrap();
        await handleSessionResponse(session);
      } catch (error) {
        setViewerState('error');
        setErrorMessage(getErrorMessage(error));
        schedulePoll(RETRY_MS);
      } finally {
        startInFlightRef.current = false;
      }
    },
    [handleSessionResponse, schedulePoll, startSession],
  );

  const pollSession = useCallback(async () => {
    if (stoppedRef.current) {
      return;
    }

    if (appStateRef.current !== 'active') {
      await teardownSession('mobile_live_feed_backgrounded', true);
      return;
    }

    try {
      const session = await fetchSession().unwrap();

      if (session.status === 'tablet_ready') {
        await bootstrapSession('reconnecting');
        return;
      }

      await handleSessionResponse(session);
    } catch (error) {
      setViewerState(current =>
        current === 'live' ? 'reconnecting' : 'error',
      );
      setErrorMessage(getErrorMessage(error));
      schedulePoll(RETRY_MS);
    }
  }, [
    bootstrapSession,
    fetchSession,
    handleSessionResponse,
    schedulePoll,
    teardownSession,
  ]);
  pollSessionRef.current = pollSession;

  const retry = useCallback(() => {
    closePeerConnection();
    void bootstrapSession('starting');
  }, [bootstrapSession, closePeerConnection]);

  useEffect(() => {
    stoppedRef.current = false;
    void ensureMicrophonePermission();
    activatePreferredAudioRoute();
    void bootstrapSession('starting');

    const appStateSubscription = AppState.addEventListener('change', nextState => {
      appStateRef.current = nextState;
      if (nextState === 'active') {
        schedulePoll(100);
      } else {
        void teardownSession('mobile_live_feed_backgrounded', true);
      }
    });

    return () => {
      stoppedRef.current = true;
      if (pollingTimerRef.current) {
        clearTimeout(pollingTimerRef.current);
      }
      appStateSubscription.remove();
      void teardownSession('mobile_live_feed_closed', true);
    };
  }, [
    activatePreferredAudioRoute,
    bootstrapSession,
    ensureMicrophonePermission,
    schedulePoll,
    teardownSession,
  ]);

  return {
    viewerState,
    errorMessage,
    remoteStreamUrl,
    streamRenderKey,
    isMicrophoneEnabled,
    isSpeakerEnabled,
    toggleMicrophone,
    toggleSpeaker,
    retry,
  };
}
