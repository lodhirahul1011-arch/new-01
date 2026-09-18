import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
  Modal,
  TouchableWithoutFeedback,
  ActivityIndicator,
  type FocusEvent,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Asset,
  ImageLibraryOptions,
  CameraOptions,
  launchCamera,
} from 'react-native-image-picker';
import {
  check,
  openSettings,
  PERMISSIONS,
  request,
  RESULTS,
} from 'react-native-permissions';

import CameraSvg from '../../../assets/icons/settings/camera.svg';
import CamSvg from '../../../assets/icons/settings/cam.svg';
import ImageSvg from '../../../assets/icons/home/image.svg';

import BlueHeader from '../../../components/layout/BlueHeader';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { authActions } from '../../../store/slices/authSlice';
import {
  useLazyUsersMeQuery,
  useUpdateProfileMutation,
  useUploadProfilePhotoMutation,
} from '../../../services/api/authApi';
import {
  getUserFriendlyImageUploadError,
  IMAGE_TOO_LARGE_MESSAGE,
  isImageFileTooLarge,
} from '../../../services/api/uploadError';
import {
  getCachedProfileImage,
  setCachedProfileImage,
} from '../../../services/storage/profileStorage';
import type { SettingsStackParamList } from '../../../navigation/tabs/stacks/SettingsStack';
import { useAppTranslation } from '../../../services/i18n';
import { logs } from '../../../services/logs';
import { pickSinglePhotoFromDevice } from '../../../services/media/photoPicker';

type Props = NativeStackScreenProps<SettingsStackParamList, 'EditProfile'>;

const NAME_REGEX = /^[A-Za-z]+(?: [A-Za-z]+)*$/;
const PROFILE_PHOTO_MAX_DIMENSION = 720;
const PROFILE_PHOTO_QUALITY = 0.6;
const PROFILE_PHOTO_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

function getProfileUpdateErrorMessage(error: any) {
  return getUserFriendlyImageUploadError(
    error,
    'Could not update profile. Please try again.',
  );
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? '';
  const b = parts[1]?.[0] ?? '';
  return (a + b).toUpperCase();
}

function getUserProfileImage(
  user?: {
    profileImage?: string;
    photoUrl?: string;
    avatarUrl?: string;
    avatar?: {
      url?: string;
    };
  } | null,
) {
  const value =
    user?.profileImage ||
    user?.photoUrl ||
    user?.avatarUrl ||
    user?.avatar?.url ||
    '';

  if (!value) return '';
  if (/^https?:\/\/ik\.imagekit\.io\//i.test(value)) return value;
  return '';
}

function getCameraPermission() {
  return Platform.select({
    ios: PERMISSIONS.IOS.CAMERA,
    android: PERMISSIONS.ANDROID.CAMERA,
  });
}

async function ensurePermission(permission?: string) {
  if (!permission) return false;

  const current = await check(permission as any);

  if (current === RESULTS.GRANTED) return true;

  if (current === RESULTS.BLOCKED) {
    await openSettings();
    return false;
  }

  const asked = await request(permission as any);
  return asked === RESULTS.GRANTED;
}

export default function EditProfile({ navigation }: Props) {
  const { t } = useAppTranslation();
  const dispatch = useAppDispatch();
  const authUser = useAppSelector(state => state.auth.user);
  const accessToken = useAppSelector(state => state.auth.accessToken);

  const [triggerUsersMe] = useLazyUsersMeQuery();
  const [updateProfile, { isLoading }] = useUpdateProfileMutation();
  const [uploadProfilePhoto, { isLoading: isUploadingPhoto }] =
    useUploadProfilePhotoMutation();

  const [fullName, setFullName] = useState(authUser?.name ?? '');
  const [email, setEmail] = useState(authUser?.email ?? '');
  const [phone, setPhone] = useState(authUser?.phone ?? '');
  const [address, setAddress] = useState(authUser?.address ?? '');

  const [profileImage, setProfileImage] = useState<string>(
    getUserProfileImage(authUser),
  );
  const [selectedPhoto, setSelectedPhoto] = useState<Asset | undefined>(
    undefined,
  );

  const [error, setError] = useState<string | undefined>(undefined);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const scrollInputAboveKeyboard = (
    event: FocusEvent,
    fieldName: 'fullName' | 'address',
  ) => {
    const scrollView = scrollViewRef.current;

    if (!scrollView) {
      logs.error('Could not scroll edit profile input above keyboard', {
        fieldName,
        reason: 'Scroll view is unavailable',
      });
      return;
    }

    try {
      scrollView.scrollResponderScrollNativeHandleToKeyboard(
        event.nativeEvent.target,
        24,
        true,
      );
      logs.info('Requested edit profile input visibility above keyboard', {
        fieldName,
      });
    } catch (scrollError) {
      logs.error('Could not scroll edit profile input above keyboard', {
        fieldName,
        scrollError,
      });
    }
  };

  useEffect(() => {
    const loadCachedPhoto = async () => {
      const userId = authUser?._id;
      if (!userId) return;

      const cachedPhoto = await getCachedProfileImage(userId);
      if (cachedPhoto) {
        setProfileImage(cachedPhoto);
        logs.info('Loaded cached profile image', { userId });
      }
    };

    loadCachedPhoto();
  }, [authUser?._id]);

  useEffect(() => {
    const bootstrap = async () => {
      if (!accessToken) return;

      try {
        const res = await triggerUsersMe().unwrap();
        if (res?.user) {
          const nextUser = {
            ...res.user,
            profileImage: getUserProfileImage(res.user),
          };

          dispatch(authActions.userUpdated(nextUser as typeof res.user));
          setFullName(nextUser.name ?? '');
          setEmail(nextUser.email ?? '');
          setPhone(nextUser.phone ?? '');
          setAddress(nextUser.address ?? '');
          setProfileImage(getUserProfileImage(nextUser));
          setSelectedPhoto(undefined);
        }
      } catch (bootstrapError) {
        logs.error('Failed to refresh profile while editing', bootstrapError);
      }
    };

    bootstrap();
  }, [accessToken, dispatch, triggerUsersMe]);

  useEffect(() => {
    if (!authUser) return;

    setFullName(authUser.name ?? '');
    setEmail(authUser.email ?? '');
    setPhone(authUser.phone ?? '');
    setAddress(authUser.address ?? '');
    setProfileImage(getUserProfileImage(authUser));
    setSelectedPhoto(undefined);
  }, [authUser]);

  const initials = useMemo(() => getInitials(fullName || 'U'), [fullName]);

  const cleanedName = useMemo(() => fullName.trim(), [fullName]);
  const cleanedAddress = useMemo(() => address.trim(), [address]);

  const nameOk = useMemo(() => {
    if (!cleanedName) return false;
    if (cleanedName.length < 2) return false;
    return NAME_REGEX.test(cleanedName);
  }, [cleanedName]);

  const canSubmit =
    nameOk && !isLoading && !isUploadingPhoto && !uploadingPhoto;

  const onChangeName = (text: string) => {
    setError(undefined);

    let next = text.replace(/[^A-Za-z ]/g, '');
    next = next.replace(/\s{2,}/g, ' ');
    next = next.replace(/^\s+/, '');

    setFullName(next);
  };

  const imageOptions: ImageLibraryOptions & CameraOptions = {
    mediaType: 'photo',
    quality: PROFILE_PHOTO_QUALITY,
    selectionLimit: 1,
    includeBase64: false,
    saveToPhotos: false,
    maxWidth: PROFILE_PHOTO_MAX_DIMENSION,
    maxHeight: PROFILE_PHOTO_MAX_DIMENSION,
  };

  const handlePickedAsset = async (asset?: Asset) => {
    if (!asset?.uri) return;

    if (
      isImageFileTooLarge(
        asset.fileSize,
        PROFILE_PHOTO_MAX_FILE_SIZE_BYTES,
      )
    ) {
      logs.error('Profile photo rejected before upload because it is too large', {
        fileSize: asset.fileSize,
        maximumBytes: PROFILE_PHOTO_MAX_FILE_SIZE_BYTES,
      });
      logs.info('Profile photo size validation message displayed');
      setError(IMAGE_TOO_LARGE_MESSAGE);
      return;
    }

    try {
      setUploadingPhoto(true);
      setError(undefined);

      setSelectedPhoto(asset);
      logs.info('Profile photo staged for upload', {
        fileName: asset.fileName,
        type: asset.type,
        width: asset.width,
        height: asset.height,
        fileSize: asset.fileSize,
      });
    } catch (pickError) {
      logs.error('Could not stage picked profile photo', pickError);
      setError('Could not update profile photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const onPickFromGallery = async () => {
    setPickerVisible(false);

    const result = await pickSinglePhotoFromDevice({
      source: 'edit_profile',
      quality: PROFILE_PHOTO_QUALITY,
      maxWidth: PROFILE_PHOTO_MAX_DIMENSION,
      maxHeight: PROFILE_PHOTO_MAX_DIMENSION,
    });

    if (result.status === 'cancelled') return;

    if (result.status === 'error') {
      logs.error('Profile photo picker failed', result.message);
      setError(result.message);
      return;
    }

    await handlePickedAsset(result.asset);
  };

  const onTakePhoto = async () => {
    setPickerVisible(false);

    const granted = await ensurePermission(getCameraPermission());
    if (!granted) {
      setError('Camera permission is required.');
      return;
    }

    const result = await launchCamera(imageOptions);
    if (result.didCancel) return;

    if (result.errorCode) {
      setError(result.errorMessage || 'Could not open camera.');
      return;
    }

    await handlePickedAsset(result.assets?.[0]);
  };

  const onSubmit = async () => {
    setError(undefined);

    if (!nameOk) {
      setError('Please enter a valid full name.');
      return;
    }

    try {
      const profileResponse = await updateProfile({
        name: cleanedName,
        address: cleanedAddress,
      }).unwrap();

      let nextUser = profileResponse?.user ?? authUser;

      if (selectedPhoto?.uri) {
        logs.info('Uploading profile photo', {
          fileName: selectedPhoto.fileName,
          type: selectedPhoto.type,
          width: selectedPhoto.width,
          height: selectedPhoto.height,
          fileSize: selectedPhoto.fileSize,
        });

        const photoResponse = await uploadProfilePhoto({
          uri: selectedPhoto.uri,
          name: selectedPhoto.fileName,
          type: selectedPhoto.type,
        }).unwrap();

        nextUser = photoResponse?.user ?? nextUser;
      }

      const resolvedProfileImage =
        getUserProfileImage(nextUser) || profileImage;

      if (selectedPhoto?.uri && !getUserProfileImage(nextUser)) {
        throw new Error(
          'Profile photo was uploaded but ImageKit URL was not returned.',
        );
      }

      if (authUser?._id && resolvedProfileImage) {
        await setCachedProfileImage(authUser._id, resolvedProfileImage);
      }

      let refreshedUser = nextUser;

      try {
        const meResponse = await triggerUsersMe().unwrap();
        if (meResponse?.user) {
          refreshedUser = {
            ...meResponse.user,
            profileImage:
              getUserProfileImage(meResponse.user) || resolvedProfileImage,
          };
        }
      } catch (refreshError) {
        logs.error('Failed to refresh profile after update', refreshError);
      }

      if (refreshedUser) {
        dispatch(
          authActions.userUpdated({
            ...refreshedUser,
            name: refreshedUser.name ?? cleanedName,
            address: refreshedUser.address ?? cleanedAddress,
            profileImage:
              getUserProfileImage(refreshedUser) || resolvedProfileImage,
          }),
        );
      } else if (authUser) {
        dispatch(
          authActions.userUpdated({
            ...authUser,
            name: cleanedName,
            address: cleanedAddress,
            profileImage: resolvedProfileImage,
          }),
        );
      }

      navigation.goBack();
    } catch (err: any) {
      logs.error('Profile update failed', err);
      setError(getProfileUpdateErrorMessage(err));
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <BlueHeader
        title={t('edit_profile_title')}
        onBackPress={() => navigation.goBack()}
        compact
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              {profileImage ? (
                <Image
                  source={{ uri: profileImage }}
                  style={styles.avatarImage}
                  resizeMode="cover"
                />
              ) : (
                <Text style={styles.avatarText}>{initials}</Text>
              )}

              <Pressable
                onPress={() => setPickerVisible(true)}
                hitSlop={10}
                style={styles.cameraBadge}
              >
                <CameraSvg width={40} height={40} />
              </Pressable>
            </View>

            <Pressable onPress={() => setPickerVisible(true)}>
              <Text style={styles.changePhoto}>{t('change_photo')}</Text>
            </Pressable>

            {uploadingPhoto && (
              <View style={styles.photoLoaderRow}>
                <ActivityIndicator size="small" color="#2563EB" />
                <Text style={styles.photoLoaderText}>
                  {t('updating_photo')}
                </Text>
              </View>
            )}
          </View>

          <Text style={styles.label}>{t('full_name')}</Text>
          <TextInput
            value={fullName}
            onChangeText={onChangeName}
            style={styles.input}
            placeholder={t('full_name')}
            placeholderTextColor="#9CA3AF"
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="next"
            maxLength={50}
            onFocus={event => scrollInputAboveKeyboard(event, 'fullName')}
          />

          <Text style={styles.label}>{t('email_address')}</Text>
          <TextInput
            value={email}
            editable={false}
            selectTextOnFocus={false}
            style={[styles.input, styles.inputDisabled]}
            placeholder={t('email_address')}
            placeholderTextColor="#9CA3AF"
          />

          <Text style={styles.label}>{t('phone_number')}</Text>
          <TextInput
            value={phone}
            editable={false}
            selectTextOnFocus={false}
            style={[styles.input, styles.inputDisabled]}
            placeholder={t('phone_number')}
            placeholderTextColor="#9CA3AF"
          />

          <Text style={styles.label}>{t('address')}</Text>
          <TextInput
            value={address}
            onChangeText={text => {
              setError(undefined);
              setAddress(text);
            }}
            style={[styles.input, styles.inputMultiline]}
            placeholder={t('address')}
            placeholderTextColor="#9CA3AF"
            multiline
            textAlignVertical="top"
            onFocus={event => scrollInputAboveKeyboard(event, 'address')}
          />

          {!!error && <Text style={styles.errorText}>{error}</Text>}

          <View style={styles.bottomSpacer} />
          <View style={styles.bottomBar}>
            <Pressable
              style={[styles.confirmBtn, !canSubmit && styles.confirmDisabled]}
              onPress={onSubmit}
              disabled={!canSubmit}
            >
              <Text style={styles.confirmText}>
                {isLoading ? t('saving_profile') : t('confirm')}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={pickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setPickerVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.sheet}>
                <Text style={styles.sheetTitle}>
                  {t('change_profile_photo')}
                </Text>

                <Pressable
                  style={styles.sheetOption}
                  onPress={onPickFromGallery}
                >
                                  <ImageSvg width={18} height={18} />

                  <Text style={styles.sheetOptionText}>
                    {t('select_from_device')}
                  </Text>
                </Pressable>

                <Pressable style={styles.sheetOption} onPress={onTakePhoto}>
                  <CamSvg width={18} height={30} />

                  <Text style={styles.sheetOptionText}>{t('take_photo')}</Text>
                </Pressable>

                <Pressable
                  style={styles.sheetCancel}
                  onPress={() => setPickerVisible(false)}
                >
                  <Text style={styles.sheetCancelText}>{t('cancel')}</Text>
                </Pressable>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  safe: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
  },

  avatarWrap: {
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 12,
  },

  avatar: {
    width: 96,
    height: 96,
    borderRadius: 999,
    backgroundColor: '#4F7DF0',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },

  avatarImage: {
    width: '99.98%',
    height: '99.98%',
    borderRadius: 999,
  },

  avatarText: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '900',
  },

  cameraBadge: {
    position: 'absolute',
    right: -10,
    bottom: 10,
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: '#2563EB',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  cameraIcon: {
    width: 36,
    height: 36,
  },

  changePhoto: {
    marginTop: 10,
    color: '#2563EB',
    fontSize: 15,
    fontWeight: '800',
  },

  photoLoaderRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  photoLoaderText: {
    color: '#2563EB',
    fontSize: 13,
    fontWeight: '600',
  },

  label: {
    marginTop: 12,
    marginBottom: 6,
    fontSize: 16,
    fontWeight: '800',
    color: '#4B5563',
  },

  input: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    backgroundColor: '#FFFFFF',
  },

  inputDisabled: {
    backgroundColor: '#F9FAFB',
    color: '#6B7280',
  },

  inputMultiline: {
    height: 76,
    paddingTop: 14,
    paddingBottom: 14,
  },

  errorText: {
    marginTop: 10,
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '600',
  },

  bottomBar: {
    paddingBottom: 28,
  },

  bottomSpacer: {
    height: 12,
  },

  confirmBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },

  confirmDisabled: {
    backgroundColor: '#9BB7F0',
  },

  confirmText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.22)',
    justifyContent: 'flex-end',
    padding: 16,
  },

  sheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
  },

  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 14,
    textAlign: 'center',
  },

  sheetOption: {
    minHeight: 54,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },

  sheetOptionIcon: {
    width: 20,
    height: 20,
    marginRight: 12,
  },

  sheetOptionText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },

  sheetCancel: {
    marginTop: 4,
    minHeight: 54,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
  },

  sheetCancelText: {
    color: '#2563EB',
    fontSize: 16,
    fontWeight: '800',
  },
});
