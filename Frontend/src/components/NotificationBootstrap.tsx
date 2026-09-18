import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAppSelector } from '../store/hooks';
import { useRegisterPushTokenMutation } from '../services/api/notificationsApi';
import {
  useAnswerTabletCallMutation,
  useRejectTabletCallMutation,
} from '../services/api/tabletCallsApi';
import {
  navigateToActiveCallScreen,
  navigateToIncomingCallScreen,
} from '../navigation/navigationRef';
import {
  bindCallNotificationActionHandlers,
  bindNotificationOpenHandlers,
  cancelIncomingCallNotification,
  refreshNotificationDiagnostics,
  setupForegroundNotifications,
  subscribeCallEnded,
  syncPushTokenWithAccessToken,
  subscribeForegroundIncomingCall,
  type ForegroundIncomingCallPayload,
} from '../services/notifications/pushNotifications';
import {
  playDefaultCallRingtone,
  stopDefaultCallRingtone,
} from '../services/notifications/callRingtone';
import { getAccessToken } from '../services/storage/tokenStorage';
import {
  isMobileBusyWithCall,
  markMobileCallActive,
} from '../services/calls/mobileCallPresence';
import { logs } from '../services/logs';

const CALLER_LABEL = 'Visitor at Door';
const TOKEN_SYNC_RETRY_MS = 15000;

export default function NotificationBootstrap() {
  const accessToken = useAppSelector(state => state.auth.accessToken);
  const isBootstrapped = useAppSelector(state => state.auth.isBootstrapped);
  const [registerPushToken] = useRegisterPushTokenMutation();
  const [answerCall] = useAnswerTabletCallMutation();
  const [rejectCall] = useRejectTabletCallMutation();
  const [incomingCall, setIncomingCall] = useState<ForegroundIncomingCallPayload | null>(null);
  const [busyAction, setBusyAction] = useState<'answer' | 'decline' | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDirectTokenSyncRef = useRef<string | null>(null);
  const tokenSyncInFlightRef = useRef(false);


  const attemptStoredAccessTokenSync = async (reason: string) => {
    if (tokenSyncInFlightRef.current) {
      return;
    }

    tokenSyncInFlightRef.current = true;
    try {
      const storedAccessToken = await getAccessToken();
      if (!storedAccessToken) {
        return;
      }

      await syncPushTokenWithAccessToken(storedAccessToken, reason);
    } catch (error) {
      logs.error('[notifications] stored token sync failed', String(error));
    } finally {
      tokenSyncInFlightRef.current = false;
    }
  };

  useEffect(() => {
    attemptStoredAccessTokenSync('notification_bootstrap_mount').catch(() => undefined);

    const intervalId = setInterval(() => {
      attemptStoredAccessTokenSync('notification_bootstrap_retry').catch(() => undefined);
    }, TOKEN_SYNC_RETRY_MS);

    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        attemptStoredAccessTokenSync('notification_bootstrap_app_active').catch(() => undefined);
      }
    });

    return () => {
      clearInterval(intervalId);
      subscription.remove();
    };
  }, []);
  useEffect(() => {
    if (!isBootstrapped) {
      return;
    }

    refreshNotificationDiagnostics().catch(error => {
      logs.error('[notifications] initial diagnostics failed', String(error));
    });

    let unsubscribeOpenHandler: (() => void) | undefined;
    let unsubscribeCallActions: (() => void) | undefined;

    bindNotificationOpenHandlers()
      .then(nextUnsubscribe => {
        unsubscribeOpenHandler = nextUnsubscribe;
      })
      .catch(error => {
        logs.error('[notifications] open handler failed', String(error));
      });

    unsubscribeCallActions = bindCallNotificationActionHandlers();
    const unsubscribeCallEnded = subscribeCallEnded(callId => {
      logs.info('[notifications] foreground call ended cleanup received', callId);
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      stopDefaultCallRingtone();
      setBusyAction(null);
      setIncomingCall(current => (current?.callId === callId ? null : current));
    });
    const unsubscribeForegroundCall = subscribeForegroundIncomingCall(payload => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }

      isMobileBusyWithCall(payload.callId)
        .then(busy => {
          if (busy) {
            logs.info('[notifications] rejecting foreground incoming call because mobile is busy', payload.callId);
            rejectCall({ callId: payload.callId, reason: 'mobile_busy' })
              .unwrap()
              .catch(error => {
                logs.error('[notifications] foreground busy reject failed', String(error));
              });
            stopDefaultCallRingtone();
            cancelIncomingCallNotification(payload.callId).catch(error => {
              logs.error('[notifications] foreground busy notification cancel failed', String(error));
            });
            return;
          }

          logs.info('[notifications] showing foreground incoming call banner', payload.callId);
          playDefaultCallRingtone();
          setBusyAction(null);
          setIncomingCall({
            ...payload,
            callerName: CALLER_LABEL,
          });
          hideTimerRef.current = setTimeout(() => {
            stopDefaultCallRingtone();
            setIncomingCall(current => (current?.callId === payload.callId ? null : current));
          }, 45000);
        })
        .catch(error => {
          logs.error('[notifications] foreground busy check failed', String(error));
        });
    });

    return () => {
      unsubscribeOpenHandler?.();
      unsubscribeCallActions?.();
      unsubscribeCallEnded();
      unsubscribeForegroundCall();
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, [isBootstrapped, rejectCall]);

  useEffect(() => {
    if (!isBootstrapped || !accessToken) {
      return;
    }

    if (lastDirectTokenSyncRef.current !== accessToken) {
      lastDirectTokenSyncRef.current = accessToken;
      syncPushTokenWithAccessToken(
        accessToken,
        'notification_bootstrap_auth_state',
      ).catch(error => {
        logs.error('[notifications] direct auth token sync failed', String(error));
      });
    }

    refreshNotificationDiagnostics().catch(error => {
      logs.error('[notifications] auth diagnostics failed', String(error));
    });

    let unsubscribe: (() => void) | undefined;

    setupForegroundNotifications(registerPushToken)
      .then(nextUnsubscribe => {
        unsubscribe = nextUnsubscribe;
      })
      .catch(error => {
        logs.error('[notifications] bootstrap failed', String(error));
      });

    return () => {
      unsubscribe?.();
    };
  }, [accessToken, isBootstrapped, registerPushToken]);

  const openIncomingCall = () => {
    if (!incomingCall?.callId || busyAction) {
      return;
    }

    navigateToIncomingCallScreen({
      callId: incomingCall.callId,
      callerName: CALLER_LABEL,
      callerPhone: incomingCall.callerPhone,
      callType: incomingCall.callType,
    });
    setIncomingCall(null);
  };

  const handleAnswer = async () => {
    if (!incomingCall?.callId || busyAction) {
      return;
    }

    const payload = incomingCall;
    try {
      setBusyAction('answer');
      if (await isMobileBusyWithCall(payload.callId)) {
        logs.info('[notifications] rejecting foreground answer because mobile is busy', payload.callId);
        await rejectCall({ callId: payload.callId, reason: 'mobile_busy' }).unwrap();
        stopDefaultCallRingtone();
        await cancelIncomingCallNotification(payload.callId).catch(() => undefined);
        setIncomingCall(null);
        return;
      }

      await answerCall({ callId: payload.callId, liveVideoRequested: false }).unwrap();
      markMobileCallActive(payload.callId);
      stopDefaultCallRingtone();
      await cancelIncomingCallNotification(payload.callId).catch(() => undefined);
      navigateToActiveCallScreen({
        callId: payload.callId,
        callerName: CALLER_LABEL,
        callerPhone: payload.callerPhone,
        callType: payload.callType,
      });
      setIncomingCall(null);
    } catch {
      setBusyAction(null);
    }
  };

  const handleDecline = async () => {
    if (!incomingCall?.callId || busyAction) {
      return;
    }

    const payload = incomingCall;
    try {
      setBusyAction('decline');
      await rejectCall({ callId: payload.callId, reason: 'rejected_from_foreground_banner' }).unwrap();
    } catch {
      // Best-effort reject; still hide the banner so the UI does not get stuck.
    } finally {
      stopDefaultCallRingtone();
      await cancelIncomingCallNotification(payload.callId).catch(() => undefined);
      setIncomingCall(null);
      setBusyAction(null);
    }
  };

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {incomingCall ? (
        <View pointerEvents="box-none" style={styles.overlay}>
          <View style={styles.banner}>
            <Pressable onPress={openIncomingCall} style={styles.infoRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>V</Text>
              </View>
              <View style={styles.titleWrap}>
                <View style={styles.nameRow}>
                  <Text numberOfLines={1} style={styles.name}>{CALLER_LABEL}</Text>
                  <Text style={styles.time}>now</Text>
                </View>
                <Text numberOfLines={1} style={styles.body}>Incoming voice call</Text>
              </View>
            </Pressable>

            <View style={styles.actionRow}>
              <Pressable
                onPress={handleDecline}
                style={[styles.actionButton, styles.declineButton]}
              >
                {busyAction === 'decline' ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.actionText}>Decline</Text>
                )}
              </Pressable>
              <Pressable
                onPress={handleAnswer}
                style={[styles.actionButton, styles.answerButton]}
              >
                {busyAction === 'answer' ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.actionText}>Answer</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: StatusBar.currentHeight ? StatusBar.currentHeight + 6 : 18,
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 9999,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  banner: {
    width: '100%',
    maxWidth: 430,
    borderRadius: 24,
    backgroundColor: 'rgba(53, 54, 58, 0.99)',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.24,
    shadowRadius: 10,
    elevation: 24,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#073544',
  },
  avatarText: {
    color: '#55C7F4',
    fontSize: 25,
    fontWeight: '900',
  },
  titleWrap: {
    flex: 1,
    marginLeft: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: {
    flexShrink: 1,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  time: {
    marginLeft: 8,
    color: 'rgba(255,255,255,0.62)',
    fontSize: 13,
    fontWeight: '600',
  },
  body: {
    marginTop: 1,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  actionRow: {
    marginTop: 12,
    flexDirection: 'row',
    columnGap: 8,
  },
  actionButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineButton: {
    backgroundColor: '#EF6961',
  },
  answerButton: {
    backgroundColor: '#5CC180',
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
});
