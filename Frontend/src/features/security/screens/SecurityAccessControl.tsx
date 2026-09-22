import React, { useMemo, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  useWindowDimensions,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../../navigation/RootNavigator';
import { AppAlert as Alert } from '../../../components/modals/AppAlert';
import BlueHeader from '../../../components/layout/BlueHeader';
import { Image } from 'react-native';
import UserGroupSvg from '../../../assets/icons/security-and-access/calendar-04.svg';
import EditSvg from '../../../assets/icons/security-and-access/edit-02.svg';
import DeleteSvg from '../../../assets/icons/security-and-access/delete-01.svg';
import AccessLevelSvg from '../../../assets/icons/security-and-access/access-level.svg';
import NfcSectionSvg from '../../../assets/icons/security-and-access/nfc-section.svg';
import NfcTopSvg from '../../../assets/icons/security-and-access/nfc-top.svg';
import SecuritySvg from '../../../assets/icons/security-and-access/security.svg';
import { useListMembersQuery } from '../../../services/api/membersApi';
import {
  useNfcCardsQuery,
  useNfcCardsOverviewQuery,
  useUpdateNfcCardMutation,
} from '../../../services/api/nfcApi';
import { useUsersMeQuery } from '../../../services/api/authApi';
import { UI_VISIBILITY } from '../../../config/uiVisibility';

type Props = NativeStackScreenProps<
  RootStackParamList,
  'SecurityAccessControl'
>;

type SecurityTab = 'nfc' | 'access';

type SummaryCard = {
  id: string;
  value: string;
  title: string;
  icon: React.ReactNode;
};

type AccessLevelCard = {
  id: string;
  title: string;
  subtitle: string;
  permissions: string[];
  assignedUsers: { id: string; name: string; initials: string; tone: 'blue' | 'green' }[];
  bulletColor: string;
};

function getInitials(value?: string) {
  const parts = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const second = parts[1]?.[0] ?? '';
  return (first + second).toUpperCase() || 'U';
}

function getSecurityLevel(activeCards: number, usersCount: number) {
  if (activeCards > 0 && usersCount > 0) return 'High';
  if (activeCards > 0) return 'Medium';
  return 'Low';
}

export default function SecurityAccessControl({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const isCompact = width < 360;

  const [activeTab, setActiveTab] = useState<SecurityTab>('nfc');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingCardId, setEditingCardId] = useState('');
  const [editingLabel, setEditingLabel] = useState('');

  const {
    data: nfcOverviewData,
    isLoading: isNfcLoading,
    isFetching: isNfcFetching,
    isError: isNfcError,
    refetch: refetchNfc,
  } = useNfcCardsOverviewQuery();
  const {
    data: nfcCardsData,
    isLoading: isNfcCardsLoading,
    isFetching: isNfcCardsFetching,
    isError: isNfcCardsError,
    refetch: refetchNfcCards,
  } = useNfcCardsQuery();
  const { data: membersData } = useListMembersQuery();
  const { data: meData } = useUsersMeQuery();
  const [updateNfcCard, { isLoading: isUpdatingCard }] = useUpdateNfcCardMutation();

  const fallbackRegisteredCard =
    nfcCardsData?.data.items.find(card => card.status !== 'removed') ?? null;
  const registeredCard = nfcOverviewData?.data.registeredCard ?? fallbackRegisteredCard;
  const usersCount = membersData?.data?.length ?? 0;
  const primaryUserName = meData?.user?.name ?? 'Primary User';

  const summaryCards = useMemo<SummaryCard[]>(
    () => [
      {
        id: 'activeCards',
        icon: <NfcTopSvg width={24} height={24} />,
        value: String(registeredCard?.status === 'active' ? 1 : 0),
        title: 'Active Card',
      },
      {
        id: 'users',
        icon: <UserGroupSvg width={24} height={24} />,
        value: String(usersCount),
        title: 'Users',
      },
      {
        id: 'security',
        icon: <SecuritySvg width={20} height={20} />,
        value: getSecurityLevel(registeredCard?.status === 'active' ? 1 : 0, usersCount),
        title: 'Security Level',
      },
    ],
    [registeredCard?.status, usersCount],
  );

  const accessLevelCards = useMemo<AccessLevelCard[]>(
    () => ([
      {
        id: 'admin',
        title: 'Admin',
        subtitle: 'Full access to all features and settings',
        permissions: [
          'Accept any delivery',
          'Authorize COD payments',
          'Manage family members',
          'Access recordings',
          'Change settings',
        ],
        assignedUsers: [
          { id: '1', name: primaryUserName, initials: getInitials(primaryUserName), tone: 'blue' },
        ],
        bulletColor: '#2563EB',
      },
      {
        id: 'simple',
        title: 'Simple Mode',
        subtitle: 'Simplified interface for elderly users',
        permissions: [
          'Accept deliveries with voice guidance',
          'Hindi language support',
          'Large font elements',
          'Auto-notifications to family',
        ],
        assignedUsers: [],
        bulletColor: '#16A34A',
      },
    ] satisfies AccessLevelCard[]).filter(
      card => UI_VISIBILITY.securitySimpleMode || card.id !== 'simple',
    ),
    [primaryUserName],
  );

  const openEditModal = () => {
    if (!registeredCard) {
      return;
    }
    setEditingCardId(registeredCard._id);
    setEditingLabel(registeredCard.label);
    setEditModalVisible(true);
  };

  const closeEditModal = () => {
    if (isUpdatingCard) return;
    setEditModalVisible(false);
    setEditingCardId('');
    setEditingLabel('');
  };

  const handleSaveEdit = async () => {
    if (!editingCardId || editingLabel.trim().length < 2) {
      Alert.alert('Invalid name', 'Card name must be at least 2 characters.');
      return;
    }

    try {
      await updateNfcCard({
        cardId: editingCardId,
        label: editingLabel.trim(),
      }).unwrap();
      closeEditModal();
    } catch (error) {
      const message =
        (error as { data?: { message?: string; error?: string } })?.data?.message ||
        (error as { data?: { message?: string; error?: string } })?.data?.error ||
        'Could not update NFC card.';
      Alert.alert('Update failed', message);
    }
  };

  const handleToggleCardStatus = () => {
    if (!registeredCard?._id || isUpdatingCard) {
      return;
    }

    const isActive = registeredCard.status === 'active';
    const nextStatus = isActive ? 'inactive' : 'active';
    const actionLabel = isActive ? 'Deactivate' : 'Activate';
    const alertTitle = isActive ? 'Deactivate Card' : 'Activate Card';
    const alertMessage = isActive
      ? 'Are you sure you want to deactivate this NFC card?'
      : 'Are you sure you want to activate this NFC card?';
    const errorTitle = isActive ? 'Deactivate failed' : 'Activate failed';
    const errorMessageFallback = isActive
      ? 'Could not deactivate NFC card.'
      : 'Could not activate NFC card.';

    Alert.alert(
      alertTitle,
      alertMessage,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: actionLabel,
          style: isActive ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await updateNfcCard({
                cardId: registeredCard._id,
                status: nextStatus,
              }).unwrap();
            } catch (error) {
              const message =
                (error as { data?: { message?: string; error?: string } })?.data?.message ||
                (error as { data?: { message?: string; error?: string } })?.data?.error ||
                errorMessageFallback;
              Alert.alert(errorTitle, message);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <BlueHeader
        title="Security & Access Control"
        subtitle="Manage NFC cards and access permissions"
        onBackPress={() => navigation.goBack()}
        compact
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          isCompact && styles.contentCompact,
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.summaryRow}>
          {summaryCards.map(card => (
            <View key={card.id} style={styles.summaryCard}>
              <View style={styles.summaryIconWrap}>{card.icon}</View>
              <Text style={styles.summaryValue}>{card.value}</Text>
              <Text style={styles.summaryTitle}>{card.title}</Text>
            </View>
          ))}
        </View>

        <View style={styles.tabSwitchWrap}>
          <Pressable
            style={[styles.tabBtn, activeTab === 'nfc' && styles.tabBtnActive]}
            onPress={() => setActiveTab('nfc')}
          >
            <NfcSectionSvg width={16} height={16} />
            <Text style={[styles.tabText, activeTab === 'nfc' && styles.tabTextActive]}>
              NFC Cards
            </Text>
          </Pressable>

          <Pressable
            style={[styles.tabBtn, activeTab === 'access' && styles.tabBtnActive]}
            onPress={() => setActiveTab('access')}
          >
            <AccessLevelSvg width={16} height={16} />
            <Text style={[styles.tabText, activeTab === 'access' && styles.tabTextActive]}>
              Access Levels
            </Text>
          </Pressable>
        </View>

        {activeTab === 'nfc' ? (
          <>
            <Text style={styles.sectionTitle}>Registered NFC Card</Text>

            {isNfcLoading || isNfcFetching || isNfcCardsLoading || isNfcCardsFetching ? (
              <View style={styles.emptyCard}>
                <ActivityIndicator color="#2362EB" />
                <Text style={styles.emptyText}>Loading NFC cards...</Text>
              </View>
            ) : isNfcError || isNfcCardsError ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Could not load NFC cards</Text>
                <Text style={styles.emptyText}>
                  Please try again to fetch NFC card details.
                </Text>
                <Pressable
                  style={styles.retryBtn}
                  onPress={() => {
                    refetchNfc();
                    refetchNfcCards();
                  }}
                >
                  <Text style={styles.retryBtnText}>Retry</Text>
                </Pressable>
              </View>
            ) : registeredCard ? (
              <View style={styles.registeredCard}>
                <View style={styles.cardTopRow}>
                  <View style={styles.cardTopLeft}>
                    <View style={styles.nfcIconBox}>
                      <NfcSectionSvg width={24} height={24} />
                    </View>

                    <View style={styles.cardInfoWrap}>
                      <Text style={styles.cardName}>{registeredCard.label}</Text>
                      <Text style={styles.cardSub}>{primaryUserName}</Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.activeBadge,
                      registeredCard.status !== 'active' && styles.inactiveBadge,
                    ]}
                  >
                    <Text
                      style={[
                        styles.activeBadgeText,
                        registeredCard.status !== 'active' && styles.inactiveBadgeText,
                      ]}
                    >
                      {registeredCard.statusLabel}
                    </Text>
                  </View>
                </View>

                <View style={styles.metaSection}>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Access Level:</Text>
                <View style={styles.roleBadge}>
                      <Text style={styles.roleBadgeText}>Admin</Text>
                    </View>
                  </View>

              <View style={styles.metaLineRow}>
                <Text style={styles.metaLineLabel}>Last Used</Text>
                <Text style={styles.metaLineValue}>{registeredCard.lastUsedLabel}</Text>
              </View>

              <View style={styles.metaLineRow}>
                <Text style={styles.metaLineLabel}>Total Uses:</Text>
                <Text style={styles.metaLineValue}>
                  {registeredCard.totalAccessCount}
                </Text>
              </View>
                </View>

              {(() => {
                const isActive = registeredCard.status === 'active';

                return (
                <View style={styles.actionRow}>
                  <Pressable
                    style={[styles.actionBtn, styles.editBtn]}
                    onPress={openEditModal}
                    disabled={isUpdatingCard}
                  >
                    <EditSvg width={18} height={18} />
                    <Text style={styles.editBtnText}>Edit</Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.actionBtn,
                      isActive ? styles.deactivateBtn : styles.activateBtn,
                    ]}
                    onPress={handleToggleCardStatus}
                    disabled={isUpdatingCard}
                  >
                    {isActive ? (
                      <DeleteSvg width={18} height={18} />
                    ) : (
                      <Image
                        source={require('../../../assets/icons/common/check-blue.png')}
                        style={styles.activateIcon}
                        resizeMode="contain"
                      />
                    )}
                    <Text
                      style={[
                        isActive
                          ? styles.deactivateBtnText
                          : styles.activateBtnText,
                      ]}
                    >
                      {isUpdatingCard
                        ? 'Updating...'
                        : isActive
                          ? 'Deactivate'
                          : 'Activate'}
                    </Text>
                  </Pressable>
                </View>
                );
              })()}
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No NFC card registered</Text>
                <Text style={styles.emptyText}>
                  Registered NFC card data will appear here once a card is added.
                </Text>
              </View>
            )}
          </>
        ) : (
          <>
            <View>
              <Text style={styles.sectionTitle}>Access Levels & Permissions</Text>
              <Text style={styles.sectionSub}>
                Define what each user level can do in the system
              </Text>
            </View>

            {accessLevelCards.map(item => (
              <View key={item.id} style={styles.levelCard}>
                <Text style={styles.levelTitle}>{item.title}</Text>
                <Text style={styles.levelSubtitle}>{item.subtitle}</Text>

                <View style={styles.divider} />

                <Text style={styles.levelSectionHeading}>Permissions</Text>

                <View style={styles.permissionList}>
                  {item.permissions.map(permission => (
                    <View key={permission} style={styles.permissionRow}>
                      <View
                        style={[
                          styles.permissionDot,
                          { backgroundColor: item.bulletColor },
                        ]}
                      />
                      <Text style={styles.permissionText}>{permission}</Text>
                    </View>
                  ))}
                </View>

                <Text style={[styles.levelSectionHeading, { marginTop: 14 }]}>
                  Assigned User{item.assignedUsers.length > 1 ? 's' : ''}
                </Text>

                <View style={styles.userChipWrap}>
                  {item.assignedUsers.map(user => (
                    <View key={user.id} style={styles.userChip}>
                      <View
                        style={[
                          styles.userChipAvatar,
                          user.tone === 'blue'
                            ? styles.userChipAvatarBlue
                            : styles.userChipAvatarGreen,
                        ]}
                      >
                        <Text style={styles.userChipAvatarText}>{user.initials}</Text>
                      </View>

                      <Text style={styles.userChipText}>{user.name}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </>
        )}

        <View style={{ height: 14 }} />
      </ScrollView>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents={editModalVisible ? 'auto' : 'none'}
        style={[styles.modalOverlay, !editModalVisible && styles.hiddenOverlay]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={closeEditModal} />
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit NFC Card</Text>
            <Pressable onPress={closeEditModal} hitSlop={10}>
              <Text style={styles.modalClose}>Cancel</Text>
            </Pressable>
          </View>

          <Text style={styles.inputLabel}>Card Name</Text>
          <TextInput
            value={editingLabel}
            onChangeText={setEditingLabel}
            placeholder="NFC - 001"
            placeholderTextColor="#9CA3AF"
            style={styles.input}
            editable={!isUpdatingCard}
          />

          <Pressable
            style={[
              styles.submitBtn,
              (editingLabel.trim().length < 2 || isUpdatingCard) && styles.buttonDisabled,
            ]}
            onPress={handleSaveEdit}
            disabled={editingLabel.trim().length < 2 || isUpdatingCard}
          >
            <Text style={styles.submitBtnText}>
              {isUpdatingCard ? 'Saving...' : 'Save Changes'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },

  content: {
    padding: 18,
    gap: 16,
  },

  contentCompact: {
    padding: 12,
  },

  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },

  summaryCard: {
    flex: 1,
    minHeight: 112,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  summaryIconWrap: {
    marginBottom: 10,
  },

  summaryValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1F2937',
    textAlign: 'center',
  },

  summaryTitle: {
    marginTop: 6,
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '500',
    color: '#3F3F46',
  },

  tabSwitchWrap: {
    flexDirection: 'row',
    backgroundColor: '#EFEFEF',
    borderRadius: 8,
    padding: 4,
    gap: 6,
  },

  tabBtn: {
    flex: 1,
    height: 38,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFEFEF',
    flexDirection: 'row',
    gap: 6,
  },

  tabBtnActive: {
    backgroundColor: '#FFFFFF',
  },

  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2F2F2F',
  },

  tabTextActive: {
    color: '#2362EB',
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },

  sectionSub: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
  },

  registeredCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    padding: 16,
  },

  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },

  cardTopLeft: {
    flexDirection: 'row',
    gap: 12,
    flex: 1,
  },

  nfcIconBox: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: '#DCE8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  cardInfoWrap: {
    flex: 1,
    justifyContent: 'center',
  },

  cardName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1F2937',
  },

  cardSub: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '500',
    color: '#52525B',
  },

  activeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#ECFDF3',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },

  inactiveBadge: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FDBA74',
  },

  activeBadgeText: {
    color: '#16A34A',
    fontSize: 12,
    fontWeight: '700',
  },

  inactiveBadgeText: {
    color: '#EA580C',
  },

  metaSection: {
    marginTop: 16,
    gap: 10,
  },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  metaLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3F3F46',
  },

  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#93C5FD',
  },

  roleBadgeText: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '700',
  },

  metaLineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },

  metaLineLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3F3F46',
  },

  metaLineValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },

  actionRow: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 12,
  },

  actionBtn: {
    flex: 1,
    height: 40,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
  },

  editBtn: {
    backgroundColor: '#F4F4F5',
    borderColor: '#D4D4D8',
  },

  deactivateBtn: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FF3B30',
  },

  activateBtn: {
    backgroundColor: '#ECFDF3',
    borderColor: '#86EFAC',
  },

  editBtnText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '500',
  },

  deactivateBtnText: {
    color: '#FF3B30',
    fontSize: 14,
    fontWeight: '500',
  },

  activateBtnText: {
    color: '#16A34A',
    fontSize: 14,
    fontWeight: '500',
  },

  activateIcon: {
    width: 18,
    height: 18,
  },

  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    padding: 18,
    alignItems: 'center',
    gap: 10,
  },

  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },

  emptyText: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'center',
  },

  retryBtn: {
    marginTop: 4,
    borderRadius: 10,
    backgroundColor: '#2362EB',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },

  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  levelCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    padding: 14,
  },

  levelTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },

  levelSubtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: '#6B7280',
  },

  divider: {
    marginTop: 14,
    marginBottom: 14,
    height: 1,
    backgroundColor: '#E5E7EB',
  },

  levelSectionHeading: {
    fontSize: 14,
    fontWeight: '800',
    color: '#374151',
  },

  permissionList: {
    marginTop: 10,
    gap: 8,
  },

  permissionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },

  permissionDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    marginTop: 6,
  },

  permissionText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: '#374151',
  },

  userChipWrap: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  userChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingRight: 10,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
  },

  userChipAvatar: {
    width: 26,
    height: 26,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },

  userChipAvatarBlue: {
    backgroundColor: '#2563EB',
  },

  userChipAvatarGreen: {
    backgroundColor: '#16A34A',
  },

  userChipAvatarText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },

  userChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
  },

  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.34)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },

  hiddenOverlay: {
    display: 'none',
  },

  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },

  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },

  modalClose: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
  },

  inputLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },

  input: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },

  submitBtn: {
    marginTop: 18,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#2362EB',
    alignItems: 'center',
    justifyContent: 'center',
  },

  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },

  buttonDisabled: {
    opacity: 0.6,
  },
});
