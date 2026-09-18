import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_WALLPAPER_PREFIX = 'device.wallpaper.';

function getDeviceWallpaperKey(userId: string, deviceId: string) {
  return `${DEVICE_WALLPAPER_PREFIX}${userId}.${deviceId}`;
}

function normalizeUserIds(userIdOrIds?: string | string[] | null) {
  const raw = Array.isArray(userIdOrIds) ? userIdOrIds : [userIdOrIds];
  const normalized = raw
    .map(item => String(item || '').trim())
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function normalizeWallpaperUrl(image?: string | null) {
  const trimmed = String(image || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\/ik\.imagekit\.io\//i.test(trimmed)) return trimmed.split('?')[0];
  return '';
}

export async function getCachedDeviceWallpaper(
  userIdOrIds?: string | string[] | null,
  deviceId?: string | null,
) {
  const userIds = normalizeUserIds(userIdOrIds);
  if (!userIds.length || !deviceId) return '';

  const primaryUserId = userIds[0];

  for (const userId of userIds) {
    const key = getDeviceWallpaperKey(userId, deviceId);
    const stored = await AsyncStorage.getItem(key);
    const normalized = normalizeWallpaperUrl(stored);

    if (stored && normalized && stored !== normalized) {
      await AsyncStorage.setItem(key, normalized);
    }
    if (stored && !normalized) {
      await AsyncStorage.removeItem(key);
      continue;
    }

    if (normalized) {
      if (userId !== primaryUserId) {
        await AsyncStorage.setItem(
          getDeviceWallpaperKey(primaryUserId, deviceId),
          normalized,
        );
      }
      return normalized;
    }
  }

  return '';
}

export async function setCachedDeviceWallpaper(
  userIdOrIds: string | string[] | null | undefined,
  deviceId: string | null | undefined,
  image: string,
) {
  const userIds = normalizeUserIds(userIdOrIds);
  if (!userIds.length || !deviceId) return;

  const normalized = normalizeWallpaperUrl(image);
  if (!normalized) return;

  await Promise.all(
    userIds.map(userId =>
      AsyncStorage.setItem(getDeviceWallpaperKey(userId, deviceId), normalized),
    ),
  );
}

export async function clearCachedDeviceWallpaper(
  userId?: string | null,
  deviceId?: string | null,
) {
  if (!userId || !deviceId) return;
  await AsyncStorage.removeItem(getDeviceWallpaperKey(userId, deviceId));
}
