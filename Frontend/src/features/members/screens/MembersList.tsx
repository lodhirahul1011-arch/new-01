import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import type { MembersStackParamList } from '../../../navigation/tabs/stacks/MembersStack';
import DeleteSvg from '../../../assets/icons/members/delete.svg';
import PencilEditSvg from '../../../assets/icons/members/pencil-edit.svg';
import PlusSignSvg from '../../../assets/icons/members/plus-sign.svg';
import ConfirmModal from '../../../components/modals/ConfirmModal';
import SuccessModal from '../../../components/modals/SuccessModal';
import BlueHeader from '../../../components/layout/BlueHeader';
import {
  useListMembersQuery,
  useRemoveMemberMutation,
  useUpdateMemberMutation,
  type FamilyMember,
} from '../../../services/api/membersApi';
import {
  getPendingMemberInvites,
  reconcilePendingMemberInvites,
  removePendingMemberInviteById,
  updatePendingMemberInviteName,
  type PendingMemberInvite,
} from '../../../services/storage/memberInviteStorage';
import {
  normalizePhoneDigits,
  resolveMemberBackendStatus,
} from '../utils/memberInvite';

type Props = NativeStackScreenProps<MembersStackParamList, 'MembersList'>;

type AccessLevel = 'full' | 'limited' | 'simple' | 'nfc_only' | 'none';

type Member = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  accessLabel?: string;
  badge?: string;
  accessLevel: AccessLevel;
  role?: 'owner' | 'admin' | 'member';
  status?: 'pending' | 'active';
};

const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 50;

function sanitizeName(value: string) {
  return value
    .replace(/[^A-Za-z\s'-]/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s+/, '')
    .slice(0, MAX_NAME_LENGTH);
}

function validateName(value: string) {
  const trimmed = value.trim();

  if (!trimmed) return 'Name is required.';
  if (trimmed.length < MIN_NAME_LENGTH) return 'Name must be at least 2 characters.';
  return '';
}

function looksLikeBackendId(value: string) {
  return /^[a-f0-9]{24}$/i.test(value);
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? '';
  const b = parts[1]?.[0] ?? '';
  return (a + b).toUpperCase();
}

function formatPhoneForDisplay(value?: string) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length >= 12) {
    return `+91 ${digits.slice(2, 12)}`;
  }
  if (digits.length === 10) {
    return `+91 ${digits}`;
  }
  return value || '';
}

function mapMember(item: FamilyMember): Member {
  const status = resolveMemberBackendStatus(item) === 'pending' ? 'pending' : 'active';
  const accessLevel: AccessLevel =
    status === 'pending'
      ? 'none'
      : item.role === 'owner'
        ? 'full'
        : 'limited';

  const accessLabel =
    status === 'pending'
      ? 'Pending'
      : accessLevel === 'full'
        ? 'Full access'
        : 'Limited access';

  const badge =
    item.role === 'owner'
      ? 'Owner'
      : item.role === 'admin'
        ? 'Admin'
        : undefined;

  const secondaryText =
    item.email?.trim() || formatPhoneForDisplay(item.phone) || 'No contact info';

  return {
    id: item._id,
    name: item.name,
    email: secondaryText,
    phone: item.phone,
    badge,
    accessLabel,
    accessLevel,
    role: item.role,
    status,
  };
}

function mapPendingInvite(invite: PendingMemberInvite): Member {
  return {
    id: invite.id,
    name: invite.name,
    email: formatPhoneForDisplay(invite.phone),
    phone: invite.phone,
    accessLabel: 'Pending',
    accessLevel: 'none',
    status: 'pending',
  };
}

function ItemSeparator() {
  return <View style={styles.sep} />;
}

export default function MembersList({ navigation }: Props) {
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleteError, setDeleteError] = useState<string | undefined>(undefined);
  const [successVisible, setSuccessVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState<string | undefined>(undefined);
  const [pendingInvites, setPendingInvites] = useState<PendingMemberInvite[]>([]);

  const {
    data,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useListMembersQuery();
  const [removeMember, { isLoading: isRemoving }] = useRemoveMemberMutation();
  const [updateMember, { isLoading: isUpdating }] = useUpdateMemberMutation();

  useFocusEffect(
    React.useCallback(() => {
      let mounted = true;

      refetch();

      getPendingMemberInvites()
        .then(items => {
          if (mounted) {
            setPendingInvites(items);
          }
        })
        .catch(() => {
          if (mounted) {
            setPendingInvites([]);
          }
        });

      return () => {
        mounted = false;
      };
    }, [refetch]),
  );

  useEffect(() => {
    const registeredPhones = (data?.data ?? [])
      .filter(item => resolveMemberBackendStatus(item) === 'active')
      .map(item => item.phone || item.email || '');

    let mounted = true;

    reconcilePendingMemberInvites(registeredPhones)
      .then(items => {
        if (mounted) {
          setPendingInvites(items);
        }
      })
      .catch(() => {
        if (mounted) {
          setPendingInvites([]);
        }
      });

    return () => {
      mounted = false;
    };
  }, [data]);

  const membersData = useMemo(() => {
    const backendMembers = (data?.data ?? []).filter(item => {
      return resolveMemberBackendStatus(item) !== 'removed';
    });

    const backendMemberPhones = new Set(
      backendMembers
        .map(item => normalizePhoneDigits(item.phone || item.email))
        .filter(Boolean),
    );

    const ownerMembers = backendMembers
      .filter(item => item.role === 'owner')
      .map(mapMember);

    const pendingBackendMembers = backendMembers
      .filter(item => {
        return item.role !== 'owner' && resolveMemberBackendStatus(item) === 'pending';
      })
      .map(mapMember);

    const activeNonOwnerMembers = backendMembers
      .filter(item => {
        return item.role !== 'owner' && resolveMemberBackendStatus(item) === 'active';
      })
      .map(mapMember);

    const unresolvedPendingInvites = pendingInvites
      .filter(invite => {
        return !backendMemberPhones.has(normalizePhoneDigits(invite.phone));
      })
      .map(mapPendingInvite);

    return [
      ...ownerMembers,
      ...pendingBackendMembers,
      ...unresolvedPendingInvites,
      ...activeNonOwnerMembers,
    ];
  }, [data, pendingInvites]);

  const onAddMember = () => navigation.navigate('AddMember');

  const onEditMember = (member: Member) => {
    setEditingMember(member);
    setEditName(member.name);
    setEditError(undefined);
    setEditVisible(true);
  };

  const closeEdit = () => {
    if (isUpdating) return;
    setEditVisible(false);
    setEditingMember(null);
    setEditName('');
    setEditError(undefined);
  };

  const confirmEdit = async () => {
    if (!editingMember || isUpdating) return;

    const nextName = editName.trim();
    const nextError = validateName(nextName);

    if (nextError) {
      setEditError(nextError);
      return;
    }

    try {
      const targetPendingInvite = pendingInvites.find(
        invite => invite.id === editingMember.id,
      );

      if (targetPendingInvite && !looksLikeBackendId(editingMember.id)) {
        const nextInvites = await updatePendingMemberInviteName(
          editingMember.id,
          nextName,
        );
        setPendingInvites(nextInvites);
      } else {
        await updateMember({ memberId: editingMember.id, name: nextName }).unwrap();
        if (targetPendingInvite) {
          const nextInvites = await updatePendingMemberInviteName(
            editingMember.id,
            nextName,
          );
          setPendingInvites(nextInvites);
        }
        await refetch();
      }
      closeEdit();
    } catch (err) {
      const message =
        (err as { data?: { error?: string; message?: string } })?.data?.error ||
        (err as { data?: { error?: string; message?: string } })?.data
          ?.message ||
        'Could not update member name.';
      setEditError(message);
    }
  };

  const onDeleteMember = (id: string) => {
    setSelectedMemberId(id);
    setDeleteError(undefined);
    setDeleteVisible(true);
  };

  const confirmDelete = async () => {
    if (!selectedMemberId || isRemoving) return;

    try {
      const targetPendingInvite = pendingInvites.find(
        invite => invite.id === selectedMemberId,
      );

      if (targetPendingInvite && !looksLikeBackendId(selectedMemberId)) {
        await removePendingMemberInviteById(selectedMemberId);
        setPendingInvites(current =>
          current.filter(invite => invite.id !== selectedMemberId),
        );
        setDeleteVisible(false);
        setSelectedMemberId(null);
        setSuccessVisible(true);
        return;
      }

      await removeMember({ memberId: selectedMemberId }).unwrap();
      if (targetPendingInvite) {
        await removePendingMemberInviteById(selectedMemberId);
        setPendingInvites(current =>
          current.filter(invite => invite.id !== selectedMemberId),
        );
      }
      await refetch();
      setDeleteVisible(false);
      setSelectedMemberId(null);
      setSuccessVisible(true);
    } catch (err) {
      const message =
        (err as { data?: { error?: string; message?: string } })?.data?.error ||
        (err as { data?: { error?: string; message?: string } })?.data
          ?.message ||
        'Could not delete member.';
      setDeleteError(message);
    }
  };

  const renderItem = ({ item }: { item: Member }) => {
    const initials = getInitials(item.name);
    const canManageMember = item.role !== 'owner';

    const accessPillStyle =
      item.status === 'pending'
        ? styles.accessPillPending
        : item.accessLevel === 'full'
          ? styles.accessPillGreen
          : item.accessLevel === 'limited'
            ? styles.accessPillBlue
          : item.accessLevel === 'simple'
            ? styles.accessPillGray
            : item.accessLevel === 'nfc_only'
              ? styles.accessPillGray
            : null;

    const accessPillTextStyle =
      item.status === 'pending'
        ? styles.accessPillTextPending
        : item.accessLevel === 'full'
          ? styles.accessPillTextGreen
          : item.accessLevel === 'limited'
            ? styles.accessPillTextBlue
          : item.accessLevel === 'simple'
            ? styles.accessPillTextGray
            : item.accessLevel === 'nfc_only'
              ? styles.accessPillTextGray
            : null;

    return (
      <View style={styles.memberRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>

        <View style={styles.memberBody}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{item.name}</Text>

            {!!item.badge && (
              <View style={styles.badgePill}>
                <Text style={styles.badgeText}>{item.badge}</Text>
              </View>
            )}
          </View>

          {!!item.email && <Text style={styles.email}>{item.email}</Text>}

          {!!item.accessLabel && (
            <View style={styles.accessPillWrap}>
              <View style={[styles.accessPillBase, accessPillStyle]}>
                <Text style={[styles.accessPillBaseText, accessPillTextStyle]}>
                  {item.accessLabel}
                </Text>
              </View>
            </View>
          )}
        </View>

        {canManageMember ? (
          <View style={styles.iconsCol}>
            <Pressable
              onPress={() => onEditMember(item)}
              hitSlop={10}
              style={styles.iconBtn}
            >
              <PencilEditSvg width={20} height={20} />
            </Pressable>

            <Pressable
              onPress={() => onDeleteMember(item.id)}
              hitSlop={10}
              style={styles.iconBtn}
            >
              <DeleteSvg width={20} height={20} />
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <BlueHeader
        title="Family Members"
        subtitle="Generate visitor access"
        leftAligned
      />

      <View style={styles.body}>
        <Pressable style={styles.addBtn} onPress={onAddMember}>
          <PlusSignSvg width={18} height={18} />
          <Text style={styles.addText}>Add Family Member</Text>
        </Pressable>

        <View style={styles.card}>
          {isLoading || isFetching ? (
            <View style={styles.stateWrap}>
              <ActivityIndicator color="#2563EB" />
              <Text style={styles.stateText}>Loading family members...</Text>
            </View>
          ) : isError ? (
            <View style={styles.stateWrap}>
              <Text style={styles.stateTitle}>Could not load family members.</Text>
              <Pressable style={styles.retryBtn} onPress={() => refetch()}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : membersData.length === 0 ? (
            <View style={styles.stateWrap}>
              <Text style={styles.stateTitle}>No family members added yet.</Text>
              <Text style={styles.stateText}>
                Invite a member to start managing family access.
              </Text>
            </View>
          ) : (
            <FlatList
              data={membersData}
              keyExtractor={m => m.id}
              renderItem={renderItem}
              ItemSeparatorComponent={ItemSeparator}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>

        <View style={styles.accessCard}>
          <Text style={styles.accessTitle}>Access Levels</Text>

          <Text style={styles.accessLine}>
            <Text style={styles.bold}>Pending:</Text> Invitation sent, waiting
            for registration
          </Text>

          <Text style={[styles.accessLine, styles.accessLineGap]}>
            <Text style={styles.bold}>Limited Access:</Text> Registered member
            access with restricted permissions
          </Text>

          <Text style={[styles.accessLine, styles.accessLineGap]}>
            <Text style={styles.bold}>Full Access:</Text> Can receive any
            delivery, manage settings
          </Text>

          {/* <Text style={[styles.accessLine, styles.accessLineGap]}>
            <Text style={styles.bold}>Simple Mode:</Text> NFC card only, no app
            required
          </Text> */}
        </View>
      </View>

      <ConfirmModal
        visible={deleteVisible}
        title="Delete Member"
        message={
          deleteError ||
          'Are you sure you want to remove this family member?'
        }
        confirmText={isRemoving ? 'Deleting...' : 'Delete'}
        cancelText="Cancel"
        onCancel={() => {
          if (isRemoving) return;
          setDeleteVisible(false);
          setSelectedMemberId(null);
          setDeleteError(undefined);
        }}
        onConfirm={confirmDelete}
      />

      <SuccessModal
        visible={successVisible}
        title="Member Removed"
        message="Family member has been removed successfully."
        buttonText="OK"
        onClose={() => setSuccessVisible(false)}
      />

      <Modal transparent visible={editVisible} animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.editCard}>
            <Text style={styles.editTitle}>Edit Member</Text>
            <Text style={styles.editLabel}>Name</Text>
            <TextInput
              value={editName}
              onChangeText={value => {
                setEditName(sanitizeName(value));
                setEditError(undefined);
              }}
              placeholder="Enter member name"
              placeholderTextColor="#9CA3AF"
              style={styles.editInput}
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={MAX_NAME_LENGTH}
            />
            {!!editError && <Text style={styles.editError}>{editError}</Text>}

            <View style={styles.editActions}>
              <Pressable
                style={[styles.editButton, styles.editCancelButton]}
                onPress={closeEdit}
                disabled={isUpdating}
              >
                <Text style={styles.editCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.editButton, styles.editSaveButton]}
                onPress={confirmEdit}
                disabled={isUpdating}
              >
                <Text style={styles.editSaveText}>
                  {isUpdating ? 'Saving...' : 'Save'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F7FB' },

  body: {
    flex: 1,
    padding: 16,
  },

  addBtn: {
    height: 52,
    backgroundColor: '#2563EB',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },

  addText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginLeft: 10,
  },

  card: {
    marginTop: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 14,
    paddingVertical: 4,
    flex: 1,
  },

  listContent: {
    paddingVertical: 8,
  },

  stateWrap: {
    flex: 1,
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20,
  },

  stateTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },

  stateText: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },

  retryBtn: {
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#DBEAFE',
  },

  retryText: {
    color: '#1D4ED8',
    fontWeight: '800',
  },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 14,
  },

  avatar: {
    width: 58,
    height: 58,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },

  avatarText: {
    color: '#2563EB',
    fontWeight: '800',
    fontSize: 22,
  },

  memberBody: {
    flex: 1,
    paddingRight: 8,
  },

  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },

  name: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },

  badgePill: {
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },

  badgeText: {
    color: '#2563EB',
    fontSize: 13,
    fontWeight: '700',
  },

  email: {
    marginTop: 6,
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '500',
  },

  accessPillWrap: {
    marginTop: 10,
  },

  accessPillBase: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },

  accessPillGreen: {
    backgroundColor: '#ECFDF3',
  },

  accessPillBlue: {
    backgroundColor: '#EFF6FF',
  },

  accessPillGray: {
    backgroundColor: '#F3F4F6',
  },

  accessPillPending: {
    backgroundColor: '#FFF7ED',
  },

  accessPillBaseText: {
    fontSize: 13,
    fontWeight: '700',
  },

  accessPillTextGreen: {
    color: '#16A34A',
  },

  accessPillTextBlue: {
    color: '#2563EB',
  },

  accessPillTextGray: {
    color: '#6B7280',
  },

  accessPillTextPending: {
    color: '#EA580C',
  },

  iconsCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 2,
  },

  iconBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  sep: {
    height: 1,
    backgroundColor: '#D1D5DB',
  },

  accessCard: {
    marginTop: 16,
    backgroundColor: '#EEF4FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#60A5FA',
    padding: 14,
  },

  accessTitle: {
    color: '#1D4ED8',
    fontWeight: '800',
    fontSize: 14,
    marginBottom: 10,
  },

  accessLine: {
    color: '#111827',
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
  },

  accessLineGap: {
    marginTop: 8,
  },

  bold: {
    fontWeight: '800',
    color: '#1D4ED8',
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17,24,39,0.38)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },

  editCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
  },

  editTitle: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 16,
  },

  editLabel: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },

  editInput: {
    height: 50,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    color: '#111827',
    fontSize: 15,
    fontWeight: '500',
  },

  editError: {
    marginTop: 10,
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '700',
  },

  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 18,
  },

  editButton: {
    minWidth: 92,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },

  editCancelButton: {
    backgroundColor: '#F3F4F6',
  },

  editSaveButton: {
    backgroundColor: '#2563EB',
  },

  editCancelText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '800',
  },

  editSaveText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
