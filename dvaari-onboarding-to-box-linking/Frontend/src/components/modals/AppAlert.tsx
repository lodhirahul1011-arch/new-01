import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AlertButton,
  type AlertOptions,
} from 'react-native';

import { logs } from '../../services/logs';
import { useUiScale } from '../../theme/responsive';

type AppAlertRequest = {
  id: number;
  title: string;
  message: string;
  buttons: AlertButton[];
  options?: AlertOptions;
};

type AlertListener = (request: AppAlertRequest | null) => void;

const listeners = new Set<AlertListener>();
const pendingAlerts: AppAlertRequest[] = [];
let activeAlert: AppAlertRequest | null = null;
let nextAlertId = 1;

function notifyListeners() {
  listeners.forEach(listener => {
    try {
      listener(activeAlert);
    } catch (error) {
      logs.error('[AppAlert] listener update failed', { error: String(error) });
    }
  });
}

function showNextAlert() {
  if (activeAlert || pendingAlerts.length === 0) return;
  activeAlert = pendingAlerts.shift() || null;
  notifyListeners();
}

function completeAlert(button?: AlertButton) {
  const completedAlert = activeAlert;
  if (!completedAlert) {
    logs.error('[AppAlert] completion requested without an active dialog');
    return;
  }

  activeAlert = null;
  notifyListeners();
  logs.info('[AppAlert] dialog closed', {
    id: completedAlert.id,
    action: button?.text || 'dismissed',
  });

  try {
    button?.onPress?.();
    completedAlert.options?.onDismiss?.();
  } catch (error) {
    logs.error('[AppAlert] dialog action failed', { error: String(error) });
  }

  showNextAlert();
}

function requestClose() {
  if (!activeAlert) return;
  if (activeAlert.options?.cancelable === false) {
    logs.info('[AppAlert] dismiss blocked for non-cancelable dialog', {
      id: activeAlert.id,
    });
    return;
  }

  const cancelButton = activeAlert.buttons.find(button => button.style === 'cancel');
  completeAlert(cancelButton);
}

function subscribeToAppAlerts(listener: AlertListener) {
  listeners.add(listener);
  listener(activeAlert);
  return () => {
    listeners.delete(listener);
  };
}

export const AppAlert = {
  alert(
    title: string,
    message?: string,
    buttons?: AlertButton[],
    options?: AlertOptions,
  ) {
    const request: AppAlertRequest = {
      id: nextAlertId,
      title: String(title || '').trim() || 'Notice',
      message: String(message || '').trim(),
      buttons: buttons?.length ? buttons : [{ text: 'OK' }],
      options,
    };
    nextAlertId += 1;
    pendingAlerts.push(request);
    logs.info('[AppAlert] dialog queued', {
      id: request.id,
      title: request.title,
    });
    showNextAlert();
  },
};

export default function AppAlertHost() {
  const styles = useStyles();
  const [request, setRequest] = useState<AppAlertRequest | null>(activeAlert);

  useEffect(() => subscribeToAppAlerts(setRequest), []);

  if (!request) return null;

  const stackedActions = request.buttons.length > 2;

  return (
    <Modal
      animationType="fade"
      hardwareAccelerated
      onRequestClose={requestClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Text style={styles.iconText}>!</Text>
          </View>

          <Text style={styles.title}>{request.title}</Text>
          {request.message ? (
            <Text style={styles.message}>{request.message}</Text>
          ) : null}

          <View style={[styles.actions, stackedActions && styles.actionsStacked]}>
            {request.buttons.map((button, index) => {
              const destructive = button.style === 'destructive';
              const cancel = button.style === 'cancel';
              return (
                <Pressable
                  key={`${request.id}-${button.text || index}`}
                  onPress={() => completeAlert(button)}
                  style={[
                    styles.actionButton,
                    cancel && styles.cancelButton,
                    destructive && styles.destructiveButton,
                    stackedActions && styles.stackedButton,
                  ]}
                >
                  <Text
                    style={[
                      styles.actionText,
                      cancel && styles.cancelText,
                      destructive && styles.destructiveText,
                    ]}
                  >
                    {button.text || 'OK'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function useStyles() {
  const scale = useUiScale();
  return useMemo(() => createStyles(scale), [scale]);
}

function createStyles(scale: number) {
  const s = (n: number) => n * scale;

  return StyleSheet.create({
    overlay: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: s(24),
      backgroundColor: 'rgba(15, 23, 42, 0.45)',
    },
    card: {
      width: '100%',
      maxWidth: s(420),
      borderRadius: s(20),
      paddingHorizontal: s(22),
      paddingTop: s(24),
      paddingBottom: s(20),
      backgroundColor: '#FFFFFF',
      shadowColor: '#0F172A',
      shadowOpacity: 0.16,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 10,
    },
    iconWrap: {
      width: s(52),
      height: s(52),
      alignSelf: 'center',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: s(26),
      marginBottom: s(16),
      backgroundColor: '#EEF4FF',
    },
    iconText: {
      color: '#2362EB',
      fontSize: s(26),
      lineHeight: s(30),
      fontWeight: '800',
    },
    title: {
      color: '#111827',
      fontSize: s(20),
      lineHeight: s(27),
      fontWeight: '800',
      textAlign: 'center',
    },
    message: {
      marginTop: s(10),
      color: '#64748B',
      fontSize: s(14),
      lineHeight: s(21),
      fontWeight: '500',
      textAlign: 'center',
    },
    actions: {
      flexDirection: 'row',
      gap: s(10),
      marginTop: s(22),
    },
    actionsStacked: {
      flexDirection: 'column',
    },
    actionButton: {
      flex: 1,
      minHeight: s(46),
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: s(10),
      paddingHorizontal: s(16),
      backgroundColor: '#2362EB',
    },
    stackedButton: {
      flex: 0,
      width: '100%',
    },
    cancelButton: {
      backgroundColor: '#F1F5F9',
    },
    destructiveButton: {
      backgroundColor: '#DC2626',
    },
    actionText: {
      color: '#FFFFFF',
      fontSize: s(14),
      fontWeight: '800',
      textAlign: 'center',
    },
    cancelText: {
      color: '#475569',
    },
    destructiveText: {
      color: '#FFFFFF',
    },
  });
}
