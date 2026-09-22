import React, { useEffect, useMemo, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
// import Slider from '@react-native-community/slider';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import Amazon from '../../../assets/icons/settings/device-management/Amazon_icon.svg';
import Flipkart from '../../../assets/icons/settings/device-management/Flipkart.svg';
import Upload from '../../../assets/icons/settings/device-management/upload.svg';
import Select from '../../../assets/icons/settings/device-management/select.svg';
import type { RootStackParamList } from '../../../navigation/RootNavigator';
import { AppAlert as Alert } from '../../../components/modals/AppAlert';
import BlueHeader from '../../../components/layout/BlueHeader';
import ConnectAccountModal from '../../../components/modals/ConnectAccountModal';
import VerifyCodeModal from '../../../components/modals/VerifyCodeModal';
import EcommerceConnectCard from '../../../components/cards/EcommerceConnectCard';
import { useAppSelector } from '../../../store/hooks';
import { useAppTranslation } from '../../../services/i18n';
import {
  getCachedDeviceWallpaper,
  setCachedDeviceWallpaper,
} from '../../../services/storage/deviceWallpaperStorage';
import {
  useWallpaperOptionsQuery,
  useLinkedDevicesSummaryQuery,
  usePatchLinkedDeviceMutation,
  useUploadDeviceWallpaperMutation,
} from '../../../services/api/authApi';
import {
  getUserFriendlyImageUploadError,
  IMAGE_TOO_LARGE_MESSAGE,
  isImageFileTooLarge,
} from '../../../services/api/uploadError';
import { logs } from '../../../services/logs';
import { pickSinglePhotoFromDevice } from '../../../services/media/photoPicker';
import { UI_VISIBILITY } from '../../../config/uiVisibility';

type Props = NativeStackScreenProps<RootStackParamList, 'DeviceManagement'>;

type WallpaperItem = {
  id: string;
  title: string;
  imageUri: string;
  isCustom?: boolean;
};

type AppId = 'amazon' | 'flipkart';

const WALLPAPER_MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

type AppConnectItem = {
  id: AppId;
  title: string;
  subtitle: string;
  icon: any;
  connected: boolean;
};

function wait(ms: number) {
  return new Promise<void>(resolve => setTimeout(() => resolve(), ms));
}

function isTransientUploadError(error: any) {
  const status = error?.status || error?.originalStatus || error?.data?.status;
  const message = String(
    error?.error || error?.message || error?.data?.message || '',
  ).toLowerCase();

  return (
    status === 'FETCH_ERROR' ||
    status === 'TIMEOUT_ERROR' ||
    status === 408 ||
    status === 429 ||
    (typeof status === 'number' && status >= 500) ||
    message.includes('network') ||
    message.includes('failed to fetch') ||
    message.includes('timeout')
  );
}


function resolveAssetUrl(pathOrUrl?: string) {
  if (!pathOrUrl) return '';
  if (/^https?:\/\/ik\.imagekit\.io\//i.test(pathOrUrl)) {
    return pathOrUrl.split('?')[0];
  }
  return '';
}

function mergeWallpapers(...groups: WallpaperItem[][]) {
  const byUrl = new Map<string, WallpaperItem>();

  for (const group of groups) {
    for (const item of group) {
      const imageUri = resolveAssetUrl(item.imageUri);
      if (!imageUri || byUrl.has(imageUri)) continue;
      byUrl.set(imageUri, { ...item, imageUri });
    }
  }

  return Array.from(byUrl.values());
}

export default function DeviceManagement({ navigation }: Props) {
  const { t } = useAppTranslation();
  const authUser = useAppSelector(state => state.auth.user);
  const signedInUserId = useMemo(
    () => String(authUser?._id || authUser?.id || '').trim(),
    [authUser?._id, authUser?.id],
  );
  const userCacheKeys = useMemo(() => {
    const candidates = [authUser?._id, authUser?.id];
    const normalized = candidates
      .map(item => String(item || '').trim())
      .filter(Boolean);
    return Array.from(new Set(normalized));
  }, [authUser?._id, authUser?.id]);
  const accessToken = useAppSelector(state => state.auth.accessToken || '');
  const authCacheKey = signedInUserId || accessToken || 'signed-out';
  const { data: wallpaperOptionsData, isFetching: isWallpaperOptionsLoading } =
    useWallpaperOptionsQuery();
  const {
    data: linkedDevicesSummary,
    refetch: refetchLinkedDevices,
    isFetching: isLinkedDevicesLoading,
  } =
    useLinkedDevicesSummaryQuery(authCacheKey, {
      refetchOnMountOrArgChange: true,
    });
  const [patchLinkedDevice, { isLoading: isSelectingWallpaper }] =
    usePatchLinkedDeviceMutation();
  const [uploadDeviceWallpaper, { isLoading: isUploadingWallpaper }] =
    useUploadDeviceWallpaperMutation();
  const linkedDevices = linkedDevicesSummary?.data?.items ?? [];
  const primaryDevice =
    linkedDevices.find(
      device => String(device.type || '').toLowerCase() === 'tablet',
    ) || linkedDevices[0];

  const [selectedWallpaperId, setSelectedWallpaperId] =
    useState('gradient-blue');
  const [uploadedImageUri, setUploadedImageUri] = useState('');
  const [selectingWallpaperId, setSelectingWallpaperId] = useState('');
  const [isHydratingWallpaper, setIsHydratingWallpaper] = useState(true);

  const [apps, setApps] = useState<AppConnectItem[]>([
    {
      id: 'amazon',
      title: 'Amazon',
      subtitle: 'Not connected',
      icon: Amazon,
      connected: false,
    },
    {
      id: 'flipkart',
      title: 'Flipkart',
      subtitle: 'Not connected',
      icon: Flipkart,
      connected: false,
    },
  ]);

  const [connectModalVisible, setConnectModalVisible] = useState(false);
  const [verifyModalVisible, setVerifyModalVisible] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState<AppId | null>(null);
  const [connectIdentifier, setConnectIdentifier] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);

  const baseWallpapers = useMemo<WallpaperItem[]>(() => {
    const apiWallpapers = (wallpaperOptionsData?.data?.items ?? [])
      .map(item => ({
        id: item.key,
        title: item.label,
        imageUri: resolveAssetUrl(item.imageUrl),
      }))
      .filter(item => item.imageUri);

    return mergeWallpapers(apiWallpapers);
  }, [wallpaperOptionsData]);

  const wallpapers = useMemo(() => {
    const list = [...baseWallpapers];

    if (uploadedImageUri) {
      list.push({
        id: 'custom-wallpaper',
        title: 'Custom Image',
        imageUri: uploadedImageUri,
        isCustom: true,
      });
    }

    return list;
  }, [baseWallpapers, uploadedImageUri]);

  const selectedApp = apps.find(app => app.id === selectedAppId);

  useFocusEffect(
    React.useCallback(() => {
      refetchLinkedDevices();
    }, [refetchLinkedDevices]),
  );

  useEffect(() => {
    let cancelled = false;
    const fallbackWallpaperId = baseWallpapers[0]?.id || 'gradient-blue';
    const run = async () => {
      setIsHydratingWallpaper(true);

      if (!primaryDevice?.deviceId) {
        if (!isLinkedDevicesLoading) {
          setUploadedImageUri('');
          setSelectedWallpaperId(fallbackWallpaperId);
        }
        if (!cancelled) {
          setIsHydratingWallpaper(false);
        }
        return;
      }

      const customWallpaperUrl = resolveAssetUrl(
        primaryDevice?.settings?.customWallpaperUrl ||
          primaryDevice?.customWallpaperUrl,
      );
      const activeWallpaperUrl = resolveAssetUrl(
        primaryDevice?.settings?.wallpaperUrl || primaryDevice?.wallpaperUrl,
      );
      const activeWallpaperPreset =
        primaryDevice?.settings?.wallpaperPreset ||
        primaryDevice?.wallpaperPreset ||
        '';

      if (customWallpaperUrl) {
        setUploadedImageUri(customWallpaperUrl);
        setCachedDeviceWallpaper(
          userCacheKeys.length ? userCacheKeys : signedInUserId,
          primaryDevice.deviceId,
          customWallpaperUrl,
        ).catch(() => undefined);
      } else {
        try {
          const cachedWallpaperUrl = await getCachedDeviceWallpaper(
            userCacheKeys.length ? userCacheKeys : signedInUserId,
            primaryDevice.deviceId,
          );
          if (!cancelled) {
            setUploadedImageUri(cachedWallpaperUrl);
            if (
              cachedWallpaperUrl &&
              (!activeWallpaperPreset ||
                activeWallpaperPreset === 'custom-wallpaper')
            ) {
              setSelectedWallpaperId('custom-wallpaper');
            }
          }
        } catch {
          if (!cancelled) {
            setUploadedImageUri('');
          }
        }
      }

      if (activeWallpaperPreset) {
        setSelectedWallpaperId(activeWallpaperPreset);
      } else if (
        activeWallpaperUrl &&
        customWallpaperUrl &&
        activeWallpaperUrl === customWallpaperUrl
      ) {
        setSelectedWallpaperId('custom-wallpaper');
      } else {
        setSelectedWallpaperId(fallbackWallpaperId);
      }

      if (!cancelled) {
        setIsHydratingWallpaper(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [
    accessToken,
    signedInUserId,
    userCacheKeys,
    baseWallpapers,
    isLinkedDevicesLoading,
    primaryDevice?.deviceId,
    primaryDevice?.settings?.customWallpaperUrl,
    primaryDevice?.customWallpaperUrl,
    primaryDevice?.settings?.wallpaperPreset,
    primaryDevice?.wallpaperPreset,
    primaryDevice?.settings?.wallpaperUrl,
    primaryDevice?.wallpaperUrl,
  ]);

  const onSelectWallpaper = async (id: string) => {
    if (!primaryDevice?.deviceId) {
      Alert.alert(
        t('no_linked_device'),
        t('please_link_device_before_selecting_wallpaper'),
      );
      return;
    }

    if (id === 'custom-wallpaper' && !uploadedImageUri) {
      Alert.alert(
        t('upload_required'),
        t('please_upload_wallpaper_before_selecting_custom_image'),
      );
      return;
    }

    const selectedWallpaper = wallpapers.find(item => item.id === id);
    const wallpaperUrl = selectedWallpaper?.imageUri || '';

    if (!wallpaperUrl) {
      Alert.alert(
        t('selection_failed'),
        t('wallpaper_image_not_available_yet'),
      );
      return;
    }

    const previousWallpaperId = selectedWallpaperId;
    setSelectedWallpaperId(id);
    setSelectingWallpaperId(id);

    try {
      await patchLinkedDevice({
        deviceId: primaryDevice.deviceId,
        settings: {
          wallpaperUrl,
          wallpaperPreset: id,
        },
      }).unwrap();
      refetchLinkedDevices();
    } catch {
      setSelectedWallpaperId(previousWallpaperId);
      Alert.alert(
        t('selection_failed'),
        t('could_not_set_wallpaper'),
      );
    } finally {
      setSelectingWallpaperId('');
    }
  };

  const onUploadFromGallery = async () => {
    if (isUploadingWallpaper) return;

    const result = await pickSinglePhotoFromDevice({
      source: 'device_wallpaper',
      quality: 0.8,
      maxWidth: 1920,
      maxHeight: 1920,
    });

    if (result.status === 'cancelled') return;

    if (result.status === 'error') {
      logs.error('Device wallpaper photo picker failed', result.message);
      Alert.alert(t('error'), result.message || t('could_not_open_gallery'));
      return;
    }

    const asset = result.asset;
    if (asset?.uri) {
      if (
        isImageFileTooLarge(
          asset.fileSize,
          WALLPAPER_MAX_FILE_SIZE_BYTES,
        )
      ) {
        logs.error('Wallpaper rejected before upload because it is too large', {
          fileSize: asset.fileSize,
          maximumBytes: WALLPAPER_MAX_FILE_SIZE_BYTES,
        });
        logs.info('Wallpaper size validation message displayed');
        Alert.alert(t('upload_failed'), IMAGE_TOO_LARGE_MESSAGE);
        return;
      }

      if (!primaryDevice?.deviceId) {
        Alert.alert(
          t('no_linked_device'),
          t('please_link_device_before_uploading_wallpaper'),
        );
        return;
      }

      try {
        let response;

        for (let attempt = 0; attempt < 4; attempt += 1) {
          try {
            response = await uploadDeviceWallpaper({
              deviceId: primaryDevice.deviceId,
              uri: asset.uri,
              name: asset.fileName ?? 'device-wallpaper.jpg',
              type: asset.type ?? 'image/jpeg',
            }).unwrap();
            break;
          } catch (err: any) {
            if (attempt >= 3 || !isTransientUploadError(err)) {
              throw err;
            }
            await wait(800 * (attempt + 1));
          }
        }

        const nextUrl = resolveAssetUrl(
          response?.data?.settings?.wallpaperUrl || response?.data?.wallpaperUrl,
        );

        if (!nextUrl) {
          throw new Error(
            'Wallpaper was uploaded but ImageKit URL was not returned.',
          );
        }

        setUploadedImageUri(nextUrl);
        setCachedDeviceWallpaper(
          userCacheKeys.length ? userCacheKeys : signedInUserId,
          primaryDevice.deviceId,
          nextUrl,
        ).catch(() => undefined);
        setSelectedWallpaperId('custom-wallpaper');
        refetchLinkedDevices();
      } catch (err: any) {
        logs.error('Wallpaper upload failed', {
          status: err?.status || err?.originalStatus,
        });
        Alert.alert(
          t('upload_failed'),
          getUserFriendlyImageUploadError(
            err,
            'Could not upload wallpaper. Please try again.',
          ),
        );
      }
    }
  };

  const openConnectFlow = (appId: AppId) => {
    setSelectedAppId(appId);
    setConnectIdentifier('');
    setConnectModalVisible(true);
  };

  const handleSendCode = async (identifier: string) => {
    try {
      setSendingCode(true);

      // future:
      // await sendAppConnectOtp({ app: selectedAppId, identifier })
      await new Promise(resolve => setTimeout(() => resolve(undefined), 500));

      setConnectIdentifier(identifier);
      setConnectModalVisible(false);
      setVerifyModalVisible(true);
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyCode = async (_code: string) => {
    try {
      setVerifyingCode(true);

      // future:
      // await verifyAppConnectOtp({ app: selectedAppId, identifier: connectIdentifier, code })
      await new Promise(resolve => setTimeout(() => resolve(undefined), 600));

      if (selectedAppId) {
        setApps(prev =>
          prev.map(app =>
            app.id === selectedAppId
              ? {
                  ...app,
                  connected: true,
                }
              : app,
          ),
        );
      }

      setVerifyModalVisible(false);
      setSelectedAppId(null);
      setConnectIdentifier('');
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleResendCode = async () => {
    // future resend call
    await new Promise(resolve => setTimeout(() => resolve(undefined), 300));
  };

  const isScreenLoading =
    isWallpaperOptionsLoading || isLinkedDevicesLoading || isHydratingWallpaper;

  return (
    <SafeAreaView style={styles.safe}>
      <BlueHeader
        title={t('device_management')}
        onBackPress={() => navigation.goBack()}
        compact
      />

      {isScreenLoading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color="#2362EB" />
          <Text style={styles.loaderText}>{t('loading_wallpapers')}</Text>
        </View>
      ) : (
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>{t('wallpaper_customize')}</Text>

        <View style={styles.wallpaperGrid}>
          {wallpapers.map(item => {
            const selected = item.id === selectedWallpaperId;

            return (
              <Pressable
                key={item.id}
                style={[
                  styles.wallpaperCard,
                  selected && styles.wallpaperCardSelected,
                ]}
                onPress={() => onSelectWallpaper(item.id)}
                disabled={isSelectingWallpaper}
              >
                {item.imageUri ? (
                  <Image
                    source={{ uri: item.imageUri }}
                    style={styles.wallpaperImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.wallpaperImage} />
                )}

                <View style={styles.wallpaperOverlay}>
                  <Text style={styles.wallpaperLabel}>{item.title}</Text>
                </View>

                {selected && (
                  <View style={styles.selectedBadge}>
                                <Select width={24} height={24} />

                  </View>
                )}

                {selectingWallpaperId === item.id && isSelectingWallpaper ? (
                  <View style={styles.settingBadge}>
                    <Text style={styles.settingBadgeText}>{t('saving')}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.uploadHeaderRow}>
          <View style={styles.uploadHeaderIconBox}>
            <Upload width={20} height={20} />
          </View>
          <Text style={styles.uploadHeaderText}>{t('upload_from_gallery')}</Text>
        </View>

        <Pressable
          style={[
            styles.uploadBox,
            isUploadingWallpaper && styles.uploadBoxBusy,
          ]}
          onPress={onUploadFromGallery}
        >
          <View style={styles.uploadCircle}>
            <Upload width={24} height={24} />
          </View>

          <Text style={styles.uploadTitle}>
            {isUploadingWallpaper
              ? t('uploading')
              : uploadedImageUri
              ? t('image_uploaded')
              : t('upload_images')}
          </Text>

          <Text style={styles.uploadSub}>
            {isUploadingWallpaper
              ? t('saving_wallpaper_to_device')
              : uploadedImageUri
              ? t('wallpaper_image_saved_from_gallery')
              : t('tap_to_select_images_from_gallery')}
          </Text>
        </Pressable>
{/* 
        <View style={styles.controlCard}>
          <Text style={styles.controlTitle}>Font Size: {fontSize}px</Text>
        </View> */}
{/* 
        <View style={styles.controlCard}>
          <Text style={styles.controlTitle}>Font Color</Text>

          <View style={styles.fontColorRow}>
            <View
              style={[
                styles.colorPreviewBox,
                { backgroundColor: fontColorHex },
              ]}
            />

            <View style={styles.fontColorInfo}>
              <Text style={styles.selectedColorText}>
                Selected: {fontColorHex}
              </Text>
              <Text style={[styles.previewText, { color: fontColorHex }]}>
                Preview Text
              </Text>
            </View>
          </View>
        </View> */}

        {UI_VISIBILITY.ecommerceConnections ? (
          <>
            <Text style={styles.sectionTitle}>{t('connect_ecommerce_apps')}</Text>

            <View style={styles.appsWrap}>
              {apps.map(app => {
                const appTitle = app.id === 'amazon' ? t('amazon') : t('flipkart');
                const appSubtitle = app.connected ? t('connected') : t('not_connected');
                return (
                  <EcommerceConnectCard
                    key={app.id}
                    title={appTitle}
                    subtitle={appSubtitle}
                    icon={app.icon}
                    connected={app.connected}
                    onPress={() => openConnectFlow(app.id)}
                  />
                );
              })}
            </View>
          </>
        ) : null}

        <View style={{ height: 20 }} />
      </ScrollView>
      )}

      <ConnectAccountModal
        visible={connectModalVisible}
        appName={selectedApp?.title ?? t('app')}
        loading={sendingCode}
        onClose={() => {
          setConnectModalVisible(false);
          setSelectedAppId(null);
        }}
        onSendCode={handleSendCode}
      />

      <VerifyCodeModal
        visible={verifyModalVisible}
        destination={connectIdentifier}
        loading={verifyingCode}
        onClose={() => {
          setVerifyModalVisible(false);
          setSelectedAppId(null);
          setConnectIdentifier('');
        }}
        onVerify={handleVerifyCode}
        onResend={handleResendCode}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  content: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 24,
  },

  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },

  loaderText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '600',
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 14,
  },

  wallpaperGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
    marginBottom: 18,
  },

  wallpaperCard: {
    width: '49%',
    height: 112,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#E5E7EB',
  },

  wallpaperCardSelected: {
    borderColor: '#2362EB',
    borderWidth: 2,
  },

  wallpaperImage: {
    width: '100%',
    height: '100%',
  },

  wallpaperOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    paddingBottom: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.12)',
  },

  wallpaperLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },

  selectedBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 26,
    height: 26,
  },

  selectedBadgeIcon: {
    width: '100%',
    height: '100%',
  },

  settingBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(17,24,39,0.78)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  settingBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },

  uploadHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },

  uploadHeaderIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  uploadHeaderIcon: {
    width: 20,
    height: 20,
  },

  uploadHeaderText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },

  uploadBox: {
    borderWidth: 2,
    borderColor: '#2362EB',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    marginBottom: 18,
  },

  uploadBoxBusy: {
    borderColor: '#7EA2F6',
  },

  uploadCircle: {
    width: 58,
    height: 58,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },

  uploadCircleIcon: {
    width: 24,
    height: 24,
  },

  uploadTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },

  uploadSub: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },

  controlCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 18,
    marginBottom: 18,
  },

  controlTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 14,
  },

  fontColorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  colorPreviewBox: {
    width: 54,
    height: 54,
    borderRadius: 12,
    marginRight: 14,
  },

  fontColorInfo: {
    flex: 1,
  },

  selectedColorText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },

  previewText: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '800',
  },

  appsWrap: {
    gap: 14,
  },
});
