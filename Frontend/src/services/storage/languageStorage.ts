import AsyncStorage from '@react-native-async-storage/async-storage';

const LANGUAGE_KEY = 'app.language';

export async function getStoredLanguage() {
  return AsyncStorage.getItem(LANGUAGE_KEY);
}

export async function setStoredLanguage(language: string) {
  await AsyncStorage.setItem(LANGUAGE_KEY, language);
}
