import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './RootNavigator';
import { logs } from '../services/logs';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

let pendingIncomingCallParams: RootStackParamList['IncomingCall'] | null = null;
let pendingActiveCallParams: RootStackParamList['ActiveCall'] | null = null;

function resetToCallScreen(
  name: 'IncomingCall' | 'ActiveCall',
  params: RootStackParamList['IncomingCall'] | RootStackParamList['ActiveCall'],
) {
  logsNavigationReset(name);
  navigationRef.resetRoot({
    index: 0,
    routes: [{ name, params } as never],
  });
}

function logsNavigationReset(name: string) {
  logs.info('[navigation] resetting root to call screen', name);
}

export function flushPendingCallNavigation() {
  if (!navigationRef.isReady()) {
    return;
  }

  if (pendingActiveCallParams) {
    const params = pendingActiveCallParams;
    pendingActiveCallParams = null;
    pendingIncomingCallParams = null;
    resetToCallScreen('ActiveCall', params);
    return;
  }

  if (pendingIncomingCallParams) {
    const params = pendingIncomingCallParams;
    pendingIncomingCallParams = null;
    resetToCallScreen('IncomingCall', params);
  }
}

export function navigateToIncomingCallScreen(params: RootStackParamList['IncomingCall']) {
  if (!navigationRef.isReady()) {
    pendingIncomingCallParams = params;
    return false;
  }

  resetToCallScreen('IncomingCall', params);
  return true;
}

export function navigateToActiveCallScreen(params: RootStackParamList['ActiveCall']) {
  if (!navigationRef.isReady()) {
    pendingActiveCallParams = params;
    return false;
  }

  resetToCallScreen('ActiveCall', params);
  return true;
}

export function navigateToNotificationTarget(
  type?: string,
  scheduleId?: string,
  callId?: string,
  callerName?: string,
  callerPhone?: string,
  callType?: string,
) {
  if (!navigationRef.isReady()) {
    return;
  }

  if (type === 'incoming_call' && callId) {
    navigateToIncomingCallScreen({
      callId,
      callerName,
      callerPhone,
      callType,
    });
    return;
  }

  if (
    type === 'delivery_boy_at_door' ||
    type === 'doorbell_at_door' ||
    type === 'tablet_offline' ||
    type === 'visitor_recognition' ||
    type === 'security_alert' ||
    type === 'weekly_summary'
  ) {
    navigationRef.navigate('MainTabs', {
      screen: 'HomeStack',
      params: {
        screen: 'Home',
      },
    } as never);
    return;
  }

  if (scheduleId) {
    navigationRef.navigate('MainTabs', {
      screen: 'DeliveryStack',
      params: {
        screen: 'DeliveryDetails',
        params: { scheduleId },
      },
    } as never);
    return;
  }

  navigationRef.navigate('MainTabs');
}
