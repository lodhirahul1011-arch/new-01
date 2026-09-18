import AsyncStorage from '@react-native-async-storage/async-storage';
const PROFILE_IMAGE_PREFIX = 'profile.image.';

function getProfileImageKey(userId: string) {
  return `${PROFILE_IMAGE_PREFIX}${userId}`;
}

function normalizeProfileImageUrl(image?: string | null) {
  if (!image) return null;

  const trimmed = image.trim();
  if (!trimmed) return null;

  if (/^https?:\/\/ik\.imagekit\.io\//i.test(trimmed)) return trimmed;
  return null;
}

export async function getCachedProfileImage(userId?: string | null) {
  if (!userId) return null;

  const stored = await AsyncStorage.getItem(getProfileImageKey(userId));
  const normalized = normalizeProfileImageUrl(stored);

  if (stored && normalized && stored !== normalized) {
    await AsyncStorage.setItem(getProfileImageKey(userId), normalized);
  }
  if (stored && !normalized) {
    await AsyncStorage.removeItem(getProfileImageKey(userId));
  }

  return normalized;
}

export async function setCachedProfileImage(
  userId: string | null | undefined,
  image: string,
) {
  if (!userId) return;

  const normalized = normalizeProfileImageUrl(image);
  if (!normalized) return;

  await AsyncStorage.setItem(getProfileImageKey(userId), normalized);
}

export async function clearCachedProfileImage(userId?: string | null) {
  if (!userId) return;
  await AsyncStorage.removeItem(getProfileImageKey(userId));
}

export async function clearAllCachedProfileImages() {
  const keys = await AsyncStorage.getAllKeys();
  const profileKeys = keys.filter(key => key.startsWith(PROFILE_IMAGE_PREFIX));
  if (profileKeys.length) {
    await AsyncStorage.multiRemove(profileKeys);
  }
}
