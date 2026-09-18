import AsyncStorage from '@react-native-async-storage/async-storage';

const CURRENT_USER_ID_KEY = 'auth.currentUserId';

export function getAuthUserId(user?: { _id?: string; id?: string } | null) {
  return String(user?._id || user?.id || '').trim();
}

export async function getCurrentUserId() {
  return AsyncStorage.getItem(CURRENT_USER_ID_KEY);
}

export async function setCurrentUserId(userId?: string | null) {
  const normalized = String(userId || '').trim();
  if (!normalized) {
    await AsyncStorage.removeItem(CURRENT_USER_ID_KEY);
    return;
  }

  await AsyncStorage.setItem(CURRENT_USER_ID_KEY, normalized);
}

export async function clearCurrentUserId() {
  await AsyncStorage.removeItem(CURRENT_USER_ID_KEY);
}
