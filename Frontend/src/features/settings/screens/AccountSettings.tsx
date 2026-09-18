import React, { useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SvgProps } from 'react-native-svg';

import type { RootStackParamList } from '../../../navigation/RootNavigator';
import { AppAlert as Alert } from '../../../components/modals/AppAlert';
import type { SettingsStackParamList } from '../../../navigation/tabs/stacks/SettingsStack';
import BlueHeader from '../../../components/layout/BlueHeader';
import ConfirmModal from '../../../components/modals/ConfirmModal';
import { PRIVACY_POLICY_URL, TERMS_CONDITIONS_URL } from '../../../config/env';
import { useAccountSessionCleanup } from '../../../hooks/useAccountSessionCleanup';
import { useDeleteAccountMutation } from '../../../services/api/authApi';
import { useAppTranslation } from '../../../services/i18n';
import { logs } from '../../../services/logs';
import SettingsChevronSvg from '../../../assets/icons/settings/elements.svg';
import SettingsHelpSvg from '../../../assets/icons/settings/help-square.svg';
import SettingsLogoutSvg from '../../../assets/icons/settings/logout-01.svg';

type Props = NativeStackScreenProps<SettingsStackParamList, 'AccountSettings'>;

type Row = {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<SvgProps>;
  danger?: boolean;
  onPress: () => void;
};

async function openLegalDocument(
  id: string,
  url: string,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  try {
    logs.info('[account-settings] legal document opening', { id, url });
    await Linking.openURL(url);
    logs.info('[account-settings] legal document opened', { id });
  } catch (error) {
    logs.error('[account-settings] legal document failed', { id, error: String(error) });
    Alert.alert(t('unable_to_open_link'), t('please_try_again_later'));
  }
}

export default function AccountSettings({ navigation }: Props) {
  const { t } = useAppTranslation();
  const clearLocalSession = useAccountSessionCleanup();
  const [deleteAccountVisible, setDeleteAccountVisible] = useState(false);
  const [deleteAccountReason, setDeleteAccountReason] = useState('');
  const [deleteAccountReasonError, setDeleteAccountReasonError] = useState('');
  const [deleteAccount, { isLoading: isDeletingAccount }] = useDeleteAccountMutation();

  const goToRootLogin = () => {
    const rootNavigation = navigation.getParent()?.getParent?.() as
      | {
          reset: (state: {
            index: number;
            routes: Array<{ name: keyof RootStackParamList }>;
          }) => void;
        }
      | undefined;

    rootNavigation?.reset({
      index: 0,
      routes: [{ name: 'Login' }],
    });
  };

  const handleDeleteAccount = async () => {
    if (isDeletingAccount) return;

    const normalizedReason = deleteAccountReason.replace(/\s+/g, ' ').trim();
    if (!normalizedReason) {
      logs.error('[account-settings] account delete blocked without reason');
      setDeleteAccountReasonError(t('delete_account_reason_required'));
      return;
    }

    try {
      logs.info('[account-settings] account delete requested', {
        hasDeletionReason: true,
      });
      await deleteAccount({ deletionReason: normalizedReason }).unwrap();
      logs.info('[account-settings] account delete completed');
      await clearLocalSession();
      setDeleteAccountVisible(false);
      setDeleteAccountReason('');
      setDeleteAccountReasonError('');
      goToRootLogin();
    } catch (error) {
      logs.error('[account-settings] account delete failed', String(error));
      Alert.alert(t('error'), t('delete_account_failed'));
      setDeleteAccountVisible(false);
      setDeleteAccountReason('');
      setDeleteAccountReasonError('');
    }
  };

  const rows = useMemo<Row[]>(
    () => [
      {
        id: 'privacy-policy',
        title: t('privacy_policy'),
        subtitle: t('privacy_policy_subtitle'),
        icon: SettingsHelpSvg,
        onPress: () => openLegalDocument('privacy_policy', PRIVACY_POLICY_URL, t),
      },
      {
        id: 'terms-conditions',
        title: t('terms_conditions'),
        subtitle: t('terms_conditions_subtitle'),
        icon: SettingsHelpSvg,
        onPress: () => openLegalDocument('terms_conditions', TERMS_CONDITIONS_URL, t),
      },
      {
        id: 'delete-account',
        title: t('delete_account'),
        subtitle: t('delete_account_subtitle'),
        icon: SettingsLogoutSvg,
        danger: true,
        onPress: () => {
          logs.info('[account-settings] delete account confirmation opened');
          setDeleteAccountReason('');
          setDeleteAccountReasonError('');
          setDeleteAccountVisible(true);
        },
      },
    ],
    [t],
  );

  return (
    <SafeAreaView style={styles.safe}>
      <BlueHeader
        title={t('account_settings')}
        subtitle={t('account_settings_subtitle')}
        compact
        onBackPress={() => navigation.goBack()}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {rows.map(row => {
          const RowIcon = row.icon;
          const isDanger = !!row.danger;

          return (
            <Pressable
              key={row.id}
              onPress={row.onPress}
              style={[styles.card, isDanger && styles.cardDanger]}
            >
              <View style={[styles.iconBox, isDanger && styles.iconBoxDanger]}>
                <RowIcon width={24} height={24} />
              </View>

              <View style={styles.cardBody}>
                <Text style={[styles.cardTitle, isDanger && styles.cardTitleDanger]}>
                  {row.title}
                </Text>
                <Text style={styles.cardSub}>{row.subtitle}</Text>
              </View>

              <SettingsChevronSvg
                width={8}
                height={14}
                style={isDanger ? styles.chevronDanger : undefined}
              />
            </Pressable>
          );
        })}
      </ScrollView>

      <ConfirmModal
        visible={deleteAccountVisible}
        title={t('delete_account')}
        message={t('delete_account_message')}
        confirmText={isDeletingAccount ? t('deleting_account') : t('delete_account')}
        cancelText={t('cancel')}
        confirmDisabled={isDeletingAccount}
        onCancel={() => {
          if (!isDeletingAccount) {
            logs.info('[account-settings] delete account confirmation cancelled');
            setDeleteAccountVisible(false);
            setDeleteAccountReason('');
            setDeleteAccountReasonError('');
          }
        }}
        onConfirm={handleDeleteAccount}
      >
        <View style={styles.reasonField}>
          <Text style={styles.reasonLabel}>{t('delete_account_reason_label')}</Text>
          <TextInput
            style={[
              styles.reasonInput,
              deleteAccountReasonError ? styles.reasonInputError : null,
            ]}
            value={deleteAccountReason}
            onChangeText={value => {
              setDeleteAccountReason(value);
              if (deleteAccountReasonError) {
                setDeleteAccountReasonError('');
              }
            }}
            placeholder={t('delete_account_reason_placeholder')}
            placeholderTextColor="#9CA3AF"
            multiline
            maxLength={500}
            editable={!isDeletingAccount}
            textAlignVertical="top"
          />
          {deleteAccountReasonError ? (
            <Text style={styles.reasonError}>{deleteAccountReasonError}</Text>
          ) : null}
        </View>
      </ConfirmModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },

  content: {
    padding: 16,
    gap: 14,
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },

  cardDanger: {
    backgroundColor: '#FFF5F5',
    borderColor: '#EF4444',
  },

  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  iconBoxDanger: {
    backgroundColor: '#FEE2E2',
  },

  cardBody: {
    flex: 1,
  },

  cardTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
  },

  cardTitleDanger: {
    color: '#111827',
  },

  cardSub: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    lineHeight: 16,
  },

  chevronDanger: {
    opacity: 0.7,
  },

  reasonField: {
    marginTop: 14,
  },

  reasonLabel: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 8,
  },

  reasonInput: {
    minHeight: 88,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    color: '#111827',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },

  reasonInputError: {
    borderColor: '#EF4444',
  },

  reasonError: {
    marginTop: 6,
    color: '#DC2626',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '800',
  },
});
