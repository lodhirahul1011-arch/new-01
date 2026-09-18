import AsyncStorage from '@react-native-async-storage/async-storage';

const SIMPLE_MODE_KEY = 'app.simple_mode_enabled';

export async function getStoredSimpleMode() {
  const value = await AsyncStorage.getItem(SIMPLE_MODE_KEY);
  return value === 'true';
}

export async function setStoredSimpleMode(enabled: boolean) {
  await AsyncStorage.setItem(SIMPLE_MODE_KEY, enabled ? 'true' : 'false');
}
