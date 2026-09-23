import React, { useMemo, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  ActivityIndicator,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation/RootNavigator';
import BlueHeader from '../../../components/layout/BlueHeader';
import {
  useLinkedDevicesSummaryQuery,
  useUnlinkDeviceMutation,
  useUsersMeQuery,
  type LinkedDeviceItem,
} from '../../../services/api/authApi';
import { useAppSelector } from '../../../store/hooks';
import { useAppTranslation } from '../../../services/i18n';
import { UI_VISIBILITY } from '../../../config/uiVisibility';
import DvaariBoxSvg from '../../../assets/icons/settings/link-device/dwari-box.svg';
import DvaariDeviceSvg from '../../../assets/icons/settings/link-device/dwari-device.svg';
import ThisDeviceSvg from '../../../assets/icons/settings/link-device/this-device.svg';
import PlusSignSvg from '../../../assets/icons/members/plus-sign.svg';
import ThreeDotSvg from '../../../assets/icons/settings/link-device/three-dot.svg';

type Props = NativeStackScreenProps<RootStackParamList, 'LinkedDevices'>;

function getThisDeviceName(userName?: string) {
  const ownerName = userName?.trim()?.split(/\s+/)[0] || 'Your';

  if (Platform.OS === 'ios') {
    return `${ownerName}'s iPhone`;
  }

  return `${ownerName}'s Android Device`;
}

function getThisDeviceStatus(
  user?: {
    email?: string;
    phone?: string;
    verified?: boolean;
    emailVerified?: boolean;
    phoneVerified?: boolean;
    isEmailVerified?: boolean;
    isPhoneVerified?: boolean;
    otpVerified?: boolean;
  } | null,
  t?: (
    key:
      | 'this_device_label'
      | 'admin'
      | 'verified_account'
      | 'verification_pending',
  ) => string,
) {
  const lines = [
    t ? t('this_device_label') : 'This device',
    t ? t('admin') : 'Admin',
  ];

  const contact = user?.email?.trim() || user?.phone?.trim();
  if (contact) {
    lines.push(contact);
  }

  const isVerified = Boolean(
    user?.verified ||
      user?.emailVerified ||
      user?.phoneVerified ||
      user?.isEmailVerified ||
      user?.isPhoneVerified ||
      user?.otpVerified,
  );

  lines.push(
    isVerified
      ? t
        ? t('verified_account')
        : 'Verified account'
      : t
      ? t('verification_pending')
      : 'Verification pending',
  );

  return lines.join('\n');
}

function formatLinkedDate(value?: string | null) {
  if (!value) return 'Linked recently';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Linked recently';

  return `Linked on ${date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })}`;
}

export default function LinkedDevices({ navigation }: Props) {
  const { t } = useAppTranslation();
  const authUser = useAppSelector(state => state.auth.user);
  const accessToken = useAppSelector(state => state.auth.accessToken);
  const [selectedDevice, setSelectedDevice] = useState<LinkedDeviceItem | null>(null);
  const [unlinkDevice, { isLoading: isRemovingDevice }] = useUnlinkDeviceMutation();

  const shouldFetch = !!accessToken;

  const { data: meData } = useUsersMeQuery(undefined, {
    skip: !shouldFetch,
  });

  const {
    data: linkedSummary,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useLinkedDevicesSummaryQuery(undefined, {
    skip: !shouldFetch,
    refetchOnFocus: true,
    refetchOnReconnect: true,
    refetchOnMountOrArgChange: true,
  });

  const resolvedUser = authUser ?? meData?.user ?? null;

  const thisDevice = useMemo(
    () => ({
      name: getThisDeviceName(resolvedUser?.name),
      status: getThisDeviceStatus(resolvedUser, t),
    }),
    [resolvedUser, t],
  );

  const allLinkedItems = linkedSummary?.data?.items ?? [];
  const linkedDevices = allLinkedItems.filter(item => item.type !== 'box');
  const boxes = allLinkedItems.filter(item => item.type === 'box');

  const handleRemoveDevice = async () => {
    if (!selectedDevice?.deviceId) {
      return;
    }

    try {
      await unlinkDevice({ deviceId: selectedDevice.deviceId }).unwrap();
      setSelectedDevice(null);
    } catch {
      // Keep modal open if API fails so user can retry or cancel.
    }
  };

  const renderLinkedCard = (
    device: LinkedDeviceItem,
    kind: 'device' | 'box',
  ) => (
    <View key={device.deviceId} style={styles.card}>
      <View style={kind === 'box' ? styles.iconGreenLight : styles.iconBlue}>
        {kind === 'box' ? (
          <DvaariBoxSvg width={24} height={24} />
        ) : (
          <DvaariDeviceSvg width={24} height={24} />
        )}
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{"Dvaari Device"}</Text>
        <Text
          style={[
            styles.activeText,
            device.status !== 'online' && styles.inactiveText,
          ]}
        >
          {device.status === 'online'
            ? t('active_now')
            : device.statusLabel || t('offline')}
        </Text>
        <Text style={styles.cardSub}>{formatLinkedDate(device.lastSeenAt)}</Text>
      </View>

      <Pressable
        hitSlop={10}
        style={styles.moreButton}
        onPress={() => setSelectedDevice(device)}
      >
        <ThreeDotSvg width={18} height={18} />
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <BlueHeader
        title={t('linked_devices_title')}
        onBackPress={() => navigation.goBack()}
      />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>{t('link_your_devices')}</Text>
          <Text style={styles.infoText}>{t('use_dvaari_devices')}</Text>
        </View>

        <Text style={styles.sectionTitle}>{t('this_device')}</Text>
        <View style={styles.card}>
          <View style={styles.iconGreen}>
            <ThisDeviceSvg width={24} height={24} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>{thisDevice.name}</Text>
            <Text style={styles.cardSub}>{thisDevice.status}</Text>
          </View>
        </View>

        <View style={styles.rowBetween}>
          <Text style={styles.sectionTitle}>{t('linked_devices_section')}</Text>
          <Text style={styles.sectionCount}>{linkedDevices.length} device</Text>
        </View>

        {isLoading || isFetching ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color="#2563EB" />
            <Text style={styles.stateText}>{t('loading_linked_devices')}</Text>
          </View>
        ) : isError ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>{t('linked_devices_error')}</Text>
            <Pressable style={styles.retryBtn} onPress={() => refetch()}>
              <Text style={styles.retryText}>{t('retry')}</Text>
            </Pressable>
          </View>
        ) : linkedDevices.length === 0 ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>{t('no_linked_screens')}</Text>
            <Text style={styles.stateText}>{t('connect_display_device')}</Text>
          </View>
        ) : (
          linkedDevices.map(device => renderLinkedCard(device, 'device'))
        )}

        <Pressable
          style={styles.primaryBtn}
          onPress={() =>
            navigation.navigate('DeviceSetup', {
              type: 'device',
              from: 'settings',
            })
          }
        >
          <PlusSignSvg width={18} height={18} />
          <Text style={styles.primaryText}>{t('link_device')}</Text>
        </Pressable>

        {UI_VISIBILITY.dvaariBox ? (
          <>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>{t('dvaari_boxes')}</Text>
              <Text style={styles.sectionCount}>{boxes.length} box</Text>
            </View>

            {boxes.length === 0 ? (
              <View style={styles.stateCard}>
                <Text style={styles.stateTitle}>{t('no_dvaari_box')}</Text>
                <Text style={styles.stateText}>{t('link_door_device')}</Text>
              </View>
            ) : (
              boxes.map(device => renderLinkedCard(device, 'box'))
            )}

            <Pressable
              style={styles.successBtn}
              onPress={() =>
                navigation.navigate('DeviceSetup', {
                  type: 'box',
                  from: 'settings',
                })
              }
            >
              <PlusSignSvg width={18} height={18} />
              <Text style={styles.successText}>{t('link_dvaari_box')}</Text>
            </Pressable>
          </>
        ) : null}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <Modal
        visible={Boolean(selectedDevice)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedDevice(null)}
      >
        <TouchableWithoutFeedback onPress={() => setSelectedDevice(null)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>{t('remove_linked_device_title')}</Text>
                <Text style={styles.modalText}>
                  {selectedDevice
                    ? `${t('remove_linked_device_message')} ${selectedDevice.name}?`
                    : t('remove_linked_device_message')}
                </Text>

                <View style={styles.modalActions}>
                  <Pressable
                    style={styles.cancelButton}
                    onPress={() => setSelectedDevice(null)}
                    disabled={isRemovingDevice}
                  >
                    <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
                  </Pressable>

                  <Pressable
                    style={styles.removeButton}
                    onPress={handleRemoveDevice}
                    disabled={isRemovingDevice}
                  >
                    <Text style={styles.removeButtonText}>
                      {isRemovingDevice ? t('removing_device') : t('remove_device')}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F4F6' },
  content: { padding: 16, gap: 16 },

  infoCard: {
    backgroundColor: '#E8F0FF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#C7DAFF',
  },
  infoTitle: { fontWeight: '900', fontSize: 16, color: '#2563EB' },
  infoText: { marginTop: 6, fontSize: 14, color: '#1E293B' },

  sectionTitle: { fontSize: 12, fontWeight: '800', color: '#6B7280' },
  sectionCount: { fontSize: 12, color: '#6B7280' },

  rowBetween: { flexDirection: 'row', justifyContent: 'space-between' },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  moreButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },

  stateCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    gap: 10,
  },

  stateTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },

  stateText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },

  retryBtn: {
    marginTop: 2,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#DBEAFE',
  },

  retryText: {
    color: '#1D4ED8',
    fontWeight: '800',
  },

  iconGreen: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBlue: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGreenLight: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '900', color: '#111827' },
  cardSub: { marginTop: 4, fontSize: 12, color: '#6B7280' },
  activeText: {
    marginTop: 4,
    fontSize: 12,
    color: '#16A34A',
    fontWeight: '800',
  },
  inactiveText: {
    color: '#6B7280',
  },

  primaryBtn: {
    marginTop: 8,
    height: 50,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryText: { color: '#FFFFFF', fontWeight: '900', fontSize: 16 },

  successBtn: {
    marginTop: 8,
    height: 50,
    borderRadius: 12,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  successText: { color: '#FFFFFF', fontWeight: '900', fontSize: 16 },
  bottomSpacer: { height: 30 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.32)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
  },
  modalText: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    color: '#4B5563',
  },
  modalActions: {
    marginTop: 20,
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
  },
  cancelButtonText: {
    color: '#2563EB',
    fontSize: 15,
    fontWeight: '800',
  },
  removeButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC2626',
  },
  removeButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
