import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_MODE_KEY = 'app.themeMode';

export type ThemeMode = 'light' | 'dark' | 'system';

export async function getStoredThemeMode(): Promise<ThemeMode | null> {
  const value = await AsyncStorage.getItem(THEME_MODE_KEY);
  return value === 'light' || value === 'dark' || value === 'system' ? value : null;
}

export async function setStoredThemeMode(mode: ThemeMode) {
  await AsyncStorage.setItem(THEME_MODE_KEY, mode);
}
