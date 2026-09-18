import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MembersStackParamList } from '../../../navigation/tabs/stacks/MembersStack';
import CancelSvg from '../../../assets/icons/members/cancel.svg';
import SuccessModal from '../../../components/modals/SuccessModal';
import {
  useInviteMemberMutation,
  useListMembersQuery,
} from '../../../services/api/membersApi';
import {
  findPendingMemberInviteByPhone,
  savePendingMemberInvite,
} from '../../../services/storage/memberInviteStorage';
import {
  isPhoneAlreadyRegistered,
  normalizePhoneDigits,
} from '../utils/memberInvite';
import { logs } from '../../../services/logs';

type Props = NativeStackScreenProps<MembersStackParamList, 'AddMember'>;

const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 50;
const MOBILE_NUMBER_LENGTH = 10;
const NAME_ALLOWED_REGEX = /^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/;

function normalizePhoneToE164(value: string) {
  const digits = normalizePhoneDigits(value).slice(0, MOBILE_NUMBER_LENGTH);

  if (!digits) {
    return '';
  }

  return `+91${digits}`;
}

function sanitizeName(value: string) {
  return value
    .replace(/[^A-Za-z\s'-]/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s+/, '')
    .slice(0, MAX_NAME_LENGTH);
}

function sanitizePhone(value: string) {
  return value.replace(/\D/g, '').slice(0, MOBILE_NUMBER_LENGTH);
}

function validateFullName(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return 'Name is required.';
  }

  if (trimmed.length < MIN_NAME_LENGTH) {
    return 'Name must be at least 2 characters.';
  }

  if (trimmed.length > MAX_NAME_LENGTH) {
    return 'Name must be 50 characters or fewer.';
  }

  if (/\s{2,}/.test(value)) {
    return 'Use only one space between words.';
  }

  if (!NAME_ALLOWED_REGEX.test(trimmed)) {
    return 'Name can only contain letters, single spaces, apostrophes, and hyphens.';
  }

  return '';
}

function validatePhone(value: string) {
  const digits = normalizePhoneDigits(value);

  if (!digits) {
    return 'Phone number is required.';
  }

  if (digits.length !== MOBILE_NUMBER_LENGTH) {
    return 'Enter a valid 10-digit mobile number.';
  }

  if (!/^[6-9]/.test(digits)) {
    return 'Enter a valid Indian mobile number.';
  }

  return '';
}

export default function AddMember({ navigation }: Props) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');

  const [error, setError] = useState<string | undefined>(undefined);
  const [successVisible, setSuccessVisible] = useState(false);
  const [inviteMember, { isLoading: loading }] = useInviteMemberMutation();
  const { data: membersData, refetch: refetchMembers } = useListMembersQuery();

  const nameError = useMemo(() => validateFullName(fullName), [fullName]);
  const phoneError = useMemo(() => validatePhone(phone), [phone]);
  const normalizedPhone = useMemo(() => normalizePhoneToE164(phone), [phone]);
  const existingMemberMatch = useMemo(() => {
    return isPhoneAlreadyRegistered(normalizedPhone, membersData?.data ?? []);
  }, [membersData, normalizedPhone]);

  const duplicatePhoneError = useMemo(() => {
    if (!existingMemberMatch) {
      return '';
    }

    return existingMemberMatch.status === 'pending'
      ? 'This number already has a pending invite.'
      : 'This number is already registered in the backend.';
  }, [existingMemberMatch]);

  const canSubmit = useMemo(() => {
    return !nameError && !phoneError && !duplicatePhoneError && !loading;
  }, [duplicatePhoneError, loading, nameError, phoneError]);

  const onClose = () => navigation.goBack();

  const onSubmit = async () => {
    setError(undefined);
    logs.info('[AddMember] invitation submission started');

    if (nameError) {
      logs.error('[AddMember] invitation validation failed', {
        field: 'fullName',
        reason: nameError,
      });
      setError(nameError);
      return;
    }

    if (phoneError) {
      logs.error('[AddMember] invitation validation failed', {
        field: 'phone',
        reason: phoneError,
      });
      setError(phoneError);
      return;
    }

    const pendingInvite = await findPendingMemberInviteByPhone(normalizedPhone);

    if (pendingInvite) {
      logs.error('[AddMember] invitation blocked by pending invite');
      setError('This number already has a pending invite.');
      return;
    }

    let latestMembers = membersData?.data ?? [];

    try {
      const latestResponse = await refetchMembers();
      latestMembers = latestResponse.data?.data ?? latestMembers;
    } catch (verificationError) {
      logs.error('[AddMember] backend member verification failed', {
        verificationError,
      });
      if (!latestMembers.length) {
        setError('Could not verify this number against the backend. Please try again.');
        return;
      }
    }

    const latestMatch = isPhoneAlreadyRegistered(normalizedPhone, latestMembers);

    if (latestMatch) {
      logs.error('[AddMember] invitation blocked by existing member', {
        status: latestMatch.status,
      });
      setError(
        latestMatch.status === 'pending'
          ? 'This number already has a pending invite.'
          : 'This number is already registered in the backend.',
      );
      return;
    }

    if (duplicatePhoneError) {
      logs.error('[AddMember] invitation blocked by duplicate number');
      setError(duplicatePhoneError);
      return;
    }

    try {
      const response = await inviteMember({
        name: fullName.trim(),
        phone: normalizedPhone,
        channel: 'sms',
      }).unwrap();

      if (!response?.ok) {
        logs.error('[AddMember] invitation API returned an unsuccessful response');
        setError('Could not send invitation. Please try again.');
        return;
      }

      const inviteId =
        response.data?.inviteId || `${normalizedPhone}_${Date.now()}`;
      await savePendingMemberInvite({
        id: inviteId,
        name: fullName.trim(),
        phone: normalizedPhone,
        email: undefined,
        createdAt: new Date().toISOString(),
        status: 'pending',
      });

      logs.info('[AddMember] invitation form closed before confirmation', {
        hasBackendInviteId: Boolean(response.data?.inviteId),
      });
      setSuccessVisible(true);
    } catch (err) {
      logs.error('[AddMember] invitation submission failed', { error: err });
      const message =
        (err as { data?: { error?: string; message?: string } })?.data?.error ||
        (err as { data?: { error?: string; message?: string } })?.data
          ?.message ||
        'Could not send invitation. Please try again.';

      setError(message);
    }
  };

  const onSuccessClose = () => {
    logs.info('[AddMember] invitation confirmation closed');
    setSuccessVisible(false);
    navigation.goBack();
  };

  return (
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

      {!successVisible ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.centerWrap}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.title}>Invite Family Member</Text>

              <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
                <CancelSvg width={18} height={18} />
              </Pressable>
            </View>

            <Text style={styles.label}>Full Name</Text>
            <TextInput
              value={fullName}
              onChangeText={text => {
                setFullName(sanitizeName(text));
                setError(undefined);
              }}
              placeholder="Enter Name"
              placeholderTextColor="#9CA3AF"
              style={styles.input}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="next"
              maxLength={MAX_NAME_LENGTH}
            />

            <Text style={[styles.label, styles.phoneLabel]}>Phone number</Text>
            <View style={styles.phoneInputWrap}>
              <Text style={styles.countryCode}>+91</Text>
              <TextInput
                value={phone}
                onChangeText={text => {
                  setPhone(sanitizePhone(text));
                  setError(undefined);
                }}
                placeholder="Enter Phone Number"
                placeholderTextColor="#9CA3AF"
                style={styles.phoneInput}
                keyboardType={Platform.select({
                  ios: 'number-pad',
                  android: 'number-pad',
                  default: 'number-pad',
                })}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                maxLength={MOBILE_NUMBER_LENGTH}
              />
            </View>

            <Text style={styles.hint}>
              They&apos;ll receive an invite to download and{'\n'}register
            </Text>

            {!!duplicatePhoneError && (
              <Text style={styles.error}>{duplicatePhoneError}</Text>
            )}
            {!!error && <Text style={styles.error}>{error}</Text>}

            <Pressable
              style={[styles.primaryBtn, !canSubmit && styles.primaryBtnDisabled]}
              onPress={onSubmit}
              disabled={!canSubmit}
            >
              <Text style={styles.primaryBtnText}>
                {loading ? 'Sending...' : 'Send Invitation'}
              </Text>
            </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      ) : null}

      <SuccessModal
        visible={successVisible}
        title="Invitation Sent"
        message="Invitation has been sent successfully."
        buttonText="OK"
        onClose={onSuccessClose}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(17,24,39,0.38)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },

  centerWrap: {
    flex: 1,
    justifyContent: 'center',
  },

  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },

  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
  },

  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  label: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },

  phoneLabel: {
    marginTop: 14,
  },

  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    color: '#111827',
    backgroundColor: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },

  phoneInputWrap: {
    height: 50,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
  },

  countryCode: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
    marginRight: 12,
  },

  phoneInput: {
    flex: 1,
    color: '#111827',
    fontSize: 16,
    fontWeight: '500',
    paddingVertical: 0,
  },

  hint: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 21,
    color: '#6B7280',
    fontWeight: '500',
  },

  error: {
    marginTop: 10,
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '700',
  },

  primaryBtn: {
    marginTop: 18,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },

  primaryBtnDisabled: {
    backgroundColor: '#9BB7F0',
  },

  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
