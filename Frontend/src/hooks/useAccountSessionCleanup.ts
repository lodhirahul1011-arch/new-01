import { useCallback } from 'react';

import { authApi } from '../services/api/authApi';
import { awayModeApi } from '../services/api/awayModeApi';
import { deviceSetupApi } from '../services/api/deviceSetupApi';
import { membersApi } from '../services/api/membersApi';
import { nfcApi } from '../services/api/nfcApi';
import { notificationsApi } from '../services/api/notificationsApi';
import { clearAllNotificationInboxStorage } from '../services/notifications/notificationInbox';
import { clearStoredPushToken } from '../services/notifications/pushNotifications';
import { clearAllCachedProfileImages } from '../services/storage/profileStorage';
import { clearCurrentUserId } from '../services/storage/sessionStorage';
import { setStoredSimpleMode } from '../services/storage/simpleModeStorage';
import { clearTokens } from '../services/storage/tokenStorage';
import { authActions } from '../store/slices/authSlice';
import { deliveryActions } from '../store/slices/deliverySlice';
import { preferencesActions } from '../store/slices/preferencesSlice';
import { useAppDispatch } from '../store/hooks';
import { logs } from '../services/logs';

export function useAccountSessionCleanup() {
  const dispatch = useAppDispatch();

  return useCallback(async () => {
    logs.info('[account-session] local session cleanup started');

    try {
      await clearTokens();
      await clearCurrentUserId();
      await clearStoredPushToken();
      await clearAllNotificationInboxStorage();
      await clearAllCachedProfileImages();
      await setStoredSimpleMode(false);

      dispatch(authActions.signedOut());
      dispatch(deliveryActions.resetDeliveries());
      dispatch(preferencesActions.simpleModeUpdated(false));
      dispatch(authApi.util.resetApiState());
      dispatch(awayModeApi.util.resetApiState());
      dispatch(deviceSetupApi.util.resetApiState());
      dispatch(membersApi.util.resetApiState());
      dispatch(nfcApi.util.resetApiState());
      dispatch(notificationsApi.util.resetApiState());

      logs.info('[account-session] local session cleanup completed');
    } catch (error) {
      logs.error('[account-session] local session cleanup failed', String(error));
      throw error;
    }
  }, [dispatch]);
}
