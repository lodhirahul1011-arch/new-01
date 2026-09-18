import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import type { RootStackParamList } from '../../../navigation/RootNavigator';
import {
  useAnswerTabletCallMutation,
  useLazyGetTabletCallQuery,
  useRejectTabletCallMutation,
} from '../../../services/api/tabletCallsApi';
import { cancelIncomingCallNotification } from '../../../services/notifications/pushNotifications';
import {
  playDefaultCallRingtone,
  stopDefaultCallRingtone,
} from '../../../services/notifications/callRingtone';
import {
  isMobileBusyWithCall,
  markMobileCallActive,
} from '../../../services/calls/mobileCallPresence';
import { logs } from '../../../services/logs';

type Props = NativeStackScreenProps<RootStackParamList, 'IncomingCall'>;

const CALLER_LABEL = 'Visitor at Door';
const TERMINAL_CALL_STATES = new Set(['declined', 'ended', 'missed', 'failed', 'paused']);
const INCOMING_RING_TIMEOUT_MS = 45_000;

function DoodleBackground() {
  const icons = [
    { x: 26, y: 92, rotate: -8 },
    { x: 168, y: 70, rotate: 14 },
    { x: 310, y: 118, rotate: -16 },
    { x: 78, y: 248, rotate: 18 },
    { x: 238, y: 282, rotate: -10 },
    { x: 34, y: 430, rotate: 9 },
    { x: 194, y: 458, rotate: -18 },
    { x: 330, y: 398, rotate: 12 },
    { x: 112, y: 620, rotate: -14 },
    { x: 286, y: 650, rotate: 16 },
    { x: 58, y: 760, rotate: 10 },
    { x: 220, y: 810, rotate: -8 },
  ];

  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 390 860" preserveAspectRatio="xMidYMid slice">
      <Rect width="390" height="860" fill="#0B1518" />
      {icons.map((item, index) => (
        <G
          key={`${item.x}-${item.y}-${index}`}
          opacity={0.105}
          transform={`translate(${item.x} ${item.y}) rotate(${item.rotate})`}
          stroke="#D8E2E5"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        >
          <Circle cx="0" cy="0" r="22" />
          <Path d="M-10 -2h20M-4 -10l10 10-10 10" />
          <Path d="M34 -18l14 14-14 14-14-14z" />
          <Path d="M-42 26c12-18 31-18 42 0M-32 18c7-8 17-8 24 0" />
          <Path d="M38 38h28v18H38zM44 32v6M60 32v6" />
          <Path d="M-54 -38c10-14 26-14 36 0M-49 -45l13 22 13-22" />
        </G>
      ))}
    </Svg>
  );
}

function LetterAvatar() {
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarLetter}>V</Text>
    </View>
  );
}

function PhoneIcon({ variant }: { variant: 'answer' | 'decline' }) {
  return (
    <Svg
      width={34}
      height={34}
      viewBox="0 0 24 24"
      fill="none"
      style={variant === 'decline' ? styles.declineIcon : styles.answerIcon}
    >
      <Path
        d="M20.6 15.25V18.05C20.6 18.91 19.91 19.62 19.04 19.62C10.94 19.62 4.38 13.06 4.38 4.96C4.38 4.09 5.09 3.4 5.95 3.4H8.75C9.42 3.4 10 3.87 10.14 4.52L10.82 7.72C10.96 8.38 10.66 9.06 10.08 9.4L8.78 10.17C9.98 12.55 11.45 14.02 13.83 15.22L14.6 13.92C14.94 13.34 15.62 13.04 16.28 13.18L19.48 13.86C20.13 14 20.6 14.58 20.6 15.25Z"
        stroke="#FFFFFF"
        strokeWidth="2.15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function IncomingCall({ navigation, route }: Props) {
  const { callId, callerPhone, callType } = route.params;
  const [answerCall] = useAnswerTabletCallMutation();
  const [rejectCall] = useRejectTabletCallMutation();
  const [fetchCall] = useLazyGetTabletCallQuery();
  const [busyAction, setBusyAction] = useState<'accept' | 'decline' | null>(null);
  const [busyGuardReady, setBusyGuardReady] = useState(false);
  const [statusText, setStatusText] = useState('Incoming voice call');
  const pollerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef = useRef(false);

  const subtitle = callerPhone || (callType === 'delivery' ? 'Delivery audio call' : 'Doorbell audio call');

  const stopEffects = () => {
    Vibration.cancel();
    stopDefaultCallRingtone();
    if (pollerRef.current) {
      clearInterval(pollerRef.current);
      pollerRef.current = null;
    }
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
  };

  const goHome = useCallback(() => {
    navigation.replace('MainTabs');
  }, [navigation]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;

    isMobileBusyWithCall(callId)
      .then(async busy => {
        if (cancelled) {
          return;
        }

        if (!busy) {
          logs.info('[calls] incoming call busy guard passed', callId);
          setBusyGuardReady(true);
          return;
        }

        logs.info('[calls] incoming call rejected because mobile is already busy', callId);
        try {
          await rejectCall({ callId, reason: 'mobile_busy' }).unwrap();
        } catch (error) {
          logs.error('[calls] failed to reject busy incoming call', String(error));
        } finally {
          stopEffects();
          await cancelIncomingCallNotification(callId).catch(error => {
            logs.error('[calls] failed to cancel busy incoming notification', String(error));
          });
          if (!closedRef.current) {
            closedRef.current = true;
            goHome();
          }
        }
      })
      .catch(error => {
        logs.error('[calls] failed to check incoming call busy state', String(error));
        if (!cancelled) {
          setBusyGuardReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [callId, goHome, rejectCall]);

  useEffect(() => {
    if (!busyGuardReady) {
      logs.info('[calls] waiting for incoming call busy guard before ringing', callId);
      return;
    }

    cancelIncomingCallNotification(callId).catch(error => {
      logs.error('[calls] failed to cancel incoming notification on call screen mount', String(error));
    });
    playDefaultCallRingtone();
    Vibration.vibrate([0, 700, 500], true);
    ringTimeoutRef.current = setTimeout(() => {
      stopEffects();
      if (!closedRef.current) {
        closedRef.current = true;
        goHome();
      }
    }, INCOMING_RING_TIMEOUT_MS);

    return () => {
      stopEffects();
    };
  }, [busyGuardReady, callId, goHome]);

  useEffect(() => {
    const syncCall = async () => {
      try {
        const call = await fetchCall({ callId }).unwrap();
        const state = call.state || 'ringing';

        if (TERMINAL_CALL_STATES.has(state)) {
          stopEffects();
          await cancelIncomingCallNotification(callId).catch(() => undefined);
          if (!closedRef.current) {
            closedRef.current = true;
            goHome();
          }
          return;
        }

        setStatusText(state === 'answered' ? 'Connecting voice call...' : 'Incoming voice call');
      } catch {
        setStatusText('Trying to reconnect call...');
      }
    };

    syncCall().catch(error => {
      logs.error('[calls] failed to sync incoming call state', String(error));
    });
    pollerRef.current = setInterval(() => {
      syncCall().catch(error => {
        logs.error('[calls] failed to poll incoming call state', String(error));
      });
    }, 1200);

    return () => {
      stopEffects();
    };
  }, [callId, fetchCall, goHome]);

  const handleAccept = async () => {
    if (busyAction) {
      return;
    }

    try {
      setBusyAction('accept');
      if (await isMobileBusyWithCall(callId)) {
        logs.info('[calls] incoming call answer rejected because mobile is already busy', callId);
        await rejectCall({ callId, reason: 'mobile_busy' }).unwrap();
        stopEffects();
        await cancelIncomingCallNotification(callId).catch(error => {
          logs.error('[calls] failed to cancel busy incoming notification after answer tap', String(error));
        });
        closedRef.current = true;
        goHome();
        return;
      }

      setStatusText('Connecting voice call...');
      await answerCall({ callId, liveVideoRequested: false }).unwrap();
      markMobileCallActive(callId);
      stopEffects();
      await cancelIncomingCallNotification(callId);
      navigation.replace('ActiveCall', {
        callId,
        callerName: CALLER_LABEL,
        callerPhone,
        callType,
      });
    } catch {
      setBusyAction(null);
      setStatusText('Unable to answer right now. Please try again.');
    }
  };

  const handleDecline = async () => {
    if (busyAction) {
      return;
    }

    try {
      setBusyAction('decline');
      await rejectCall({ callId, reason: 'rejected_by_resident' }).unwrap();
    } catch {
      // Best-effort decline. Navigation should still continue.
    } finally {
      await cancelIncomingCallNotification(callId).catch(() => undefined);
      stopEffects();
      closedRef.current = true;
      goHome();
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0B1518" />
      <DoodleBackground />
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{CALLER_LABEL}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          <Text style={styles.statusText}>{statusText}</Text>
        </View>

        <View style={styles.avatarWrap}>
          <LetterAvatar />
        </View>

        <View style={styles.actions}>
          <View style={styles.actionItem}>
            <Pressable onPress={handleDecline} style={[styles.roundButton, styles.declineButton]}>
              {busyAction === 'decline' ? <ActivityIndicator color="#FFFFFF" /> : <PhoneIcon variant="decline" />}
            </Pressable>
            <Text style={styles.actionLabel}>Decline</Text>
          </View>

          <View style={styles.actionItem}>
            <Pressable onPress={handleAccept} style={[styles.roundButton, styles.acceptButton]}>
              {busyAction === 'accept' ? <ActivityIndicator color="#FFFFFF" /> : <PhoneIcon variant="answer" />}
            </Pressable>
            <Text style={styles.actionLabel}>Answer</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0B1518',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 60,
    paddingBottom: 34,
  },
  header: {
    alignItems: 'center',
    minHeight: 80,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.64)',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  statusText: {
    marginTop: 10,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  avatarWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  avatar: {
    width: 216,
    height: 216,
    borderRadius: 108,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#073544',
  },
  avatarLetter: {
    color: '#55C7F4',
    fontSize: 92,
    fontWeight: '900',
  },
  actions: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  actionItem: {
    alignItems: 'center',
    minWidth: 112,
  },
  roundButton: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineButton: {
    backgroundColor: '#F00646',
  },
  acceptButton: {
    backgroundColor: '#20B461',
  },
  actionLabel: {
    marginTop: 14,
    color: 'rgba(255,255,255,0.68)',
    fontSize: 16,
    fontWeight: '700',
  },
  answerIcon: {
    transform: [{ rotate: '-18deg' }],
  },
  declineIcon: {
    transform: [{ rotate: '135deg' }],
  },
});
