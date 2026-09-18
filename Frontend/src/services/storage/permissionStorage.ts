import AsyncStorage from '@react-native-async-storage/async-storage';

import {logs} from '../logs';

const PERMISSIONS_COMPLETED_VERSION = 'delivery-notification-access-v2';
const PERMISSIONS_COMPLETED_KEY = `app.permissionsCompleted.${PERMISSIONS_COMPLETED_VERSION}`;

export async function getPermissionsCompleted() {
  try {
    const value = await AsyncStorage.getItem(PERMISSIONS_COMPLETED_KEY);
    const completed = value === 'true';
    logs.info('[permissions-storage] permissions completion read', {
      completed,
      version: PERMISSIONS_COMPLETED_VERSION,
    });
    return completed;
  } catch (error) {
    logs.error('[permissions-storage] permissions completion read failed', String(error));
    return false;
  }
}

export async function setPermissionsCompleted(completed: boolean) {
  try {
    await AsyncStorage.setItem(PERMISSIONS_COMPLETED_KEY, completed ? 'true' : 'false');
    logs.info('[permissions-storage] permissions completion saved', {
      completed,
      version: PERMISSIONS_COMPLETED_VERSION,
    });
  } catch (error) {
    logs.error('[permissions-storage] permissions completion save failed', String(error));
    throw error;
  }
}
