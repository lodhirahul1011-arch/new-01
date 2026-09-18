import React, { useMemo, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import CardSvg from '../../../assets/icons/settings/nfc/card.svg';
import TrashSvg from '../../../assets/icons/settings/nfc/trash.svg';


import type { RootStackParamList } from '../../../navigation/RootNavigator';
import { AppAlert as Alert } from '../../../components/modals/AppAlert';
import BlueHeader from '../../../components/layout/BlueHeader';
import ConfirmModal from '../../../components/modals/ConfirmModal';
import { useAppSelector } from '../../../store/hooks';
import {
  useNfcCardsQuery,
  useNfcCardsOverviewQuery,
  useRegisterNfcCardMutation,
  useRemoveNfcCardMutation,
} from '../../../services/api/nfcApi';
import { useAppTranslation } from '../../../services/i18n';
import { logs } from '../../../services/logs';


type Props = NativeStackScreenProps<RootStackParamList, 'NfcCard'>;

const NFC_DIGIT_LENGTH = 10;
const NFC_FORMAT_GROUP_SIZE = 4;
const NFC_FORMATTED_INPUT_MAX_LENGTH =
  NFC_DIGIT_LENGTH + Math.ceil(NFC_DIGIT_LENGTH / NFC_FORMAT_GROUP_SIZE) - 1;
const NFC_CARD_SCREEN_TITLE = 'NFC Card';
const REMOVE_CARD_DIALOG_COPY = {
  title: 'Remove NFC Card',
  message: 'Are you sure you want to remove this NFC card?',
  confirm: 'Remove',
  confirming: 'Removing...',
  cancel: 'Cancel',
} as const;

function sanitizeCardNumber(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, NFC_DIGIT_LENGTH);
  if (digits !== value.replace(/\s/g, '')) {
    logs.info('[nfc-card] card number input sanitized', {
      rawLength: value.length,
      digitLength: digits.length,
    });
  }
  return digits;
}

function formatCardNumber(value: string) {
  const digits = sanitizeCardNumber(value);
  return digits
    .match(new RegExp(`.{1,${NFC_FORMAT_GROUP_SIZE}}`, 'g'))
    ?.join(' ') || '';
}

function formatCardNumberWithMask(value: string) {
  const digits = sanitizeCardNumber(value);
  const masked = `${digits}${'X'.repeat(Math.max(0, NFC_DIGIT_LENGTH - digits.length))}`;
  return masked
    .match(new RegExp(`.{1,${NFC_FORMAT_GROUP_SIZE}}`, 'g'))
    ?.join(' ') || '';
}

export default function NfcCard({ navigation }: Props) {
  const { t } = useAppTranslation();
  const authUser = useAppSelector(state => state.auth.user);
  const registeredUserName = authUser?.name?.trim() || t('registered_user');

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [removeModalVisible, setRemoveModalVisible] = useState(false);
  const [cardHolderName, setCardHolderName] = useState(registeredUserName);
  const [cardUid, setCardUid] = useState('');

  const {
    data,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useNfcCardsOverviewQuery();
  const {
    data: nfcCardsData,
    isLoading: isCardsListLoading,
    isFetching: isCardsListFetching,
    isError: isCardsListError,
    refetch: refetchCardsList,
  } = useNfcCardsQuery();
  const [registerNfcCard, { isLoading: isRegistering }] = useRegisterNfcCardMutation();
  const [removeNfcCard, { isLoading: isRemoving }] = useRemoveNfcCardMutation();

  const overview = data?.data;
  const fallbackRegisteredCard =
    nfcCardsData?.data.items.find(card => card.status !== 'removed') ?? null;
  const registeredCard = overview?.registeredCard ?? fallbackRegisteredCard;
  const warning = overview?.warning;
  const isCardActive = registeredCard?.status === 'active';

  const addFormError = useMemo(() => {
    if (!cardUid.trim()) {
      return '';
    }

    if (cardUid.trim().length !== NFC_DIGIT_LENGTH) {
      return t('card_number_10_digits');
    }

    return '';
  }, [cardUid, t]);

  const handleRemoveCard = () => {
    if (!registeredCard?._id || isRemoving) {
      logs.error('[nfc-card] remove confirmation could not be opened', {
        hasRegisteredCard: !!registeredCard?._id,
        isRemoving,
      });
      return;
    }

    logs.info('[nfc-card] remove confirmation opened', {
      cardId: registeredCard._id,
    });
    setRemoveModalVisible(true);
  };

  const closeRemoveModal = () => {
    if (isRemoving) {
      logs.error('[nfc-card] remove confirmation close blocked during removal');
      return;
    }

    logs.info('[nfc-card] remove confirmation cancelled');
    setRemoveModalVisible(false);
  };

  const confirmRemoveCard = async () => {
    const cardId = registeredCard?._id;

    if (!cardId || isRemoving) {
      logs.error('[nfc-card] remove confirmation could not continue', {
        hasRegisteredCard: !!cardId,
        isRemoving,
      });
      return;
    }

    try {
      logs.info('[nfc-card] remove card started', { cardId });
      await removeNfcCard({ cardId }).unwrap();
      logs.info('[nfc-card] remove card completed', { cardId });
      setRemoveModalVisible(false);
    } catch (error) {
      logs.error('Could not remove NFC card', error);
      const message =
        (error as { data?: { message?: string; error?: string } })?.data?.message ||
        (error as { data?: { message?: string; error?: string } })?.data?.error ||
        t('could_not_remove_nfc_card_try_again');
      Alert.alert(t('remove_failed'), t(message));
    }
  };

  const openAddModal = () => {
    setCardHolderName(registeredUserName);
    setCardUid('');
    setAddModalVisible(true);
  };

  const closeAddModal = () => {
    if (isRegistering) return;
    setAddModalVisible(false);
    setCardHolderName(registeredUserName);
    setCardUid('');
  };

  const handleRegisterCard = async () => {
    if (!cardHolderName.trim()) {
      Alert.alert(t('invalid_details'), t('registered_user_name_required'));
      return;
    }

    if (addFormError) {
      Alert.alert(t('invalid_details'), addFormError);
      return;
    }

    try {
      logs.info('[nfc-card] register card started');
      await registerNfcCard({
        label: cardHolderName.trim(),
        uid: cardUid.trim(),
        cardType: 'access',
        meta: {
          source: 'settings_nfc',
          registrationMethod: 'manual',
        },
      }).unwrap();
      logs.info('[nfc-card] register card completed');
      closeAddModal();
    } catch (error) {
      logs.error('Could not register NFC card', error);
      const message =
        (error as { data?: { message?: string; error?: string } })?.data?.message ||
        (error as { data?: { message?: string; error?: string } })?.data?.error ||
        t('could_not_register_nfc_card_try_again');
      Alert.alert(t('registration_failed'), t(message));
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <BlueHeader
        title={NFC_CARD_SCREEN_TITLE}
        onBackPress={() => navigation.goBack()}
        compact
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {warning ? (
          <View style={styles.infoBanner}>
            <Image
              source={require('../../../assets/icons/common/info.png')}
              style={styles.infoBannerIcon}
              resizeMode="contain"
            />
            <View style={styles.infoBannerTextWrap}>
              <Text style={styles.infoBannerTitle}>{t(warning.title)}</Text>
              <Text style={styles.infoBannerText}>{t(warning.message)}</Text>
            </View>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>{t('registered_card')}</Text>

        {isLoading || isFetching || isCardsListLoading || isCardsListFetching ? (
          <View style={styles.emptyCard}>
            <ActivityIndicator color="#2362EB" />
            <Text style={styles.emptySub}>{t('loading_nfc_card_details')}</Text>
          </View>
        ) : isError || isCardsListError ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{t('could_not_load_nfc_card')}</Text>
            <Text style={styles.emptySub}>
              {t('could_not_fetch_nfc_card_details')}
            </Text>
            <Pressable
              style={styles.addCardBtn}
              onPress={() => {
                refetch();
                refetchCardsList();
              }}
            >
              <Text style={styles.addCardBtnText}>{t('retry')}</Text>
            </Pressable>
          </View>
        ) : registeredCard ? (
          <>
            <View style={styles.nfcCard}>
              <View style={styles.cardTopRow}>
                <View>
                  <Text style={styles.cardTopLabel}>{t('nfc_access_card')}</Text>
                  <Text style={styles.cardTitle}>{registeredCard.label}</Text>
                </View>

              <View style={styles.cardIconWrap}>
                                <CardSvg width={24} height={24} />

              </View>
              </View>

              <View style={styles.cardBlock}>
                <Text style={styles.cardSmallLabel}>{t('card_number')}</Text>
                <Text style={styles.cardNumber}>{registeredCard.serialMasked}</Text>
              </View>

              <View style={styles.cardBottomRow}>
                <View>
                  <Text style={styles.cardSmallLabel}>{t('added_on')}</Text>
                  <Text style={styles.cardDate}>{registeredCard.addedOnLabel}</Text>
                </View>

                <View
                  style={[
                    styles.activeBadge,
                    !isCardActive && styles.inactiveBadge,
                  ]}
                >
                  <Text
                    style={[
                      styles.activeBadgeText,
                      !isCardActive && styles.inactiveBadgeText,
                    ]}
                  >   
                    {registeredCard.statusLabel}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.infoCardTitle}>{t('card_information')}</Text>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t('status')}</Text>
                <Text
                  style={[
                    styles.infoValue,
                    isCardActive
                      ? styles.infoValueActive
                      : styles.infoValueInactive,
                  ]}
                >
                  {registeredCard.statusLabel}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t('last_used')}</Text>
                <Text style={styles.infoValue}>{registeredCard.lastUsedLabel}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t('total_access')}</Text>
                <Text style={styles.infoValue}>
                  {t('access_count_times', { count: registeredCard.totalAccessCount })}
                </Text>
              </View>
            </View>

            <Pressable
              style={[styles.removeBtn, isRemoving && styles.buttonDisabled]}
              onPress={handleRemoveCard}
              disabled={isRemoving}
            >
                               <TrashSvg width={24} height={24} />

              <Text style={styles.removeBtnText}>
                {isRemoving ? t('removing') : t('remove_card')}
              </Text>
            </Pressable>
          </>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{t('no_card_registered')}</Text>
            <Text style={styles.emptySub}>
              {t('nfc_card_info_empty_hint')}
            </Text>
            <Pressable style={styles.addCardBtn} onPress={openAddModal}>
              <Text style={styles.addCardBtnText}>{t('add_nfc_card')}</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.howToCard}>
          <Text style={styles.howToTitle}>{t('how_to_use_nfc_card')}</Text>

          <View style={styles.stepRow}>
            <View style={styles.stepCircle}>
              <Text style={styles.stepNumber}>1</Text>
            </View>
            <Text style={styles.stepText}>
              {t('tap_add_nfc_card_confirm_user')}
            </Text>
          </View>

          <View style={styles.stepRow}>
            <View style={styles.stepCircle}>
              <Text style={styles.stepNumber}>2</Text>
            </View>
            <Text style={styles.stepText}>
              {t('enter_10_digit_card_number')}
            </Text>
          </View>

          <View style={styles.stepRow}>
            <View style={styles.stepCircle}>
              <Text style={styles.stepNumber}>3</Text>
            </View>
            <Text style={styles.stepText}>
              {t('card_registered_ready_to_use')}
            </Text>
          </View>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents={addModalVisible ? 'auto' : 'none'}
        style={[styles.modalOverlay, !addModalVisible && styles.hiddenOverlay]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={closeAddModal} />
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('add_nfc_card')}</Text>
            <Pressable onPress={closeAddModal} hitSlop={10}>
              <Text style={styles.modalClose}>{t('cancel')}</Text>
            </Pressable>
          </View>

          <Text style={styles.inputLabel}>{t('registered_user')}</Text>
          <TextInput
            value={cardHolderName}
            onChangeText={setCardHolderName}
            placeholder={t('registered_user')}
            placeholderTextColor="#9CA3AF"
            style={[styles.input, styles.inputDisabled]}
            editable={false}
          />

          <Text style={styles.inputLabel}>{t('card_number')}</Text>
          <View style={styles.maskedInputWrap}>
            <Text style={styles.maskedInputText}>
              <Text style={styles.maskedInputFilled}>
                {formatCardNumber(cardUid)}
              </Text>
              <Text style={styles.maskedInputPlaceholder}>
                {formatCardNumberWithMask(cardUid).slice(
                  formatCardNumber(cardUid).length,
                )}
              </Text>
            </Text>
            <TextInput
              value={formatCardNumber(cardUid)}
              onChangeText={text => setCardUid(sanitizeCardNumber(text))}
              placeholder=""
              style={styles.maskedInputField}
              keyboardType={Platform.select({
                ios: 'number-pad',
                android: 'number-pad',
                default: 'number-pad',
              })}
              maxLength={NFC_FORMATTED_INPUT_MAX_LENGTH}
              editable={!isRegistering}
              selectionColor="#2362EB"
            />
          </View>

          {!!addFormError && <Text style={styles.formError}>{addFormError}</Text>}

          <Pressable
            style={[
              styles.submitBtn,
              (!!addFormError || !cardHolderName.trim() || cardUid.length !== NFC_DIGIT_LENGTH || isRegistering) &&
                styles.buttonDisabled,
            ]}
            onPress={handleRegisterCard}
            disabled={
              !!addFormError ||
              !cardHolderName.trim() ||
              cardUid.length !== NFC_DIGIT_LENGTH ||
              isRegistering
            }
          >
            <Text style={styles.submitBtnText}>
              {isRegistering ? t('registering') : t('register_nfc_card')}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <ConfirmModal
        visible={removeModalVisible}
        title={REMOVE_CARD_DIALOG_COPY.title}
        message={REMOVE_CARD_DIALOG_COPY.message}
        confirmText={
          isRemoving
            ? REMOVE_CARD_DIALOG_COPY.confirming
            : REMOVE_CARD_DIALOG_COPY.confirm
        }
        cancelText={REMOVE_CARD_DIALOG_COPY.cancel}
        confirmDisabled={isRemoving}
        onCancel={closeRemoveModal}
        onConfirm={confirmRemoveCard}
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

  infoBanner: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  infoBannerIcon: {
    width: 24,
    height: 24,
    marginRight: 12,
    marginTop: 2,
  },

  infoBannerTextWrap: {
    flex: 1,
  },

  infoBannerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#92400E',
    marginBottom: 8,
  },

  infoBannerText: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '500',
    color: '#92400E',
  },

  sectionTitle: {
    marginTop: 24,
    marginBottom: 16,
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },

  nfcCard: {
    backgroundColor: '#2362EB',
    borderRadius: 26,
    paddingHorizontal: 20,
    paddingVertical: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },

  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  cardTopLabel: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 10,
  },

  cardTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },

  cardIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  cardTopIcon: {
    width: 24,
    height: 24,
  },

  cardBlock: {
    marginTop: 34,
  },

  cardSmallLabel: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 10,
  },

  cardNumber: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.6,
  },

  cardBottomRow: {
    marginTop: 34,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },

  cardDate: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  activeBadge: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#22C55E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  inactiveBadge: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FDBA74',
  },

  activeBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  inactiveBadgeText: {
    color: '#EA580C',
  },

  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginBottom: 16,
  },

  infoCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 18,
  },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 34,
    marginBottom: 10,
  },

  infoLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },

  infoValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },

  infoValueActive: {
    color: '#22C55E',
  },

  infoValueInactive: {
    color: '#EA580C',
  },

  removeBtn: {
    height: 62,
    borderRadius: 18,
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginBottom: 18,
  },

  removeBtnIcon: {
    width: 20,
    height: 20,
    marginRight: 10,
  },

  removeBtnText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '800',
  },

  addCardBtn: {
    marginTop: 16,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#2362EB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    alignSelf: 'flex-start',
  },

  addCardBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  emptyCard: {
    minHeight: 130,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingVertical: 22,
    justifyContent: 'center',
    marginBottom: 18,
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
  },

  emptySub: {
    fontSize: 14,
    lineHeight: 24,
    fontWeight: '500',
    color: '#6B7280',
  },

  howToCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 18,
    paddingVertical: 18,
  },

  howToTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 18,
  },

  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },

  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 1,
  },

  stepNumber: {
    color: '#2362EB',
    fontSize: 14,
    fontWeight: '800',
  },

  stepText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 28,
    fontWeight: '500',
    color: '#6B7280',
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
    marginTop: 10,
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

  maskedInputWrap: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    paddingHorizontal: 14,
    position: 'relative',
  },

  maskedInputText: {
    fontSize: 15,
    letterSpacing: 0.8,
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'monospace',
    }),
  },

  maskedInputFilled: {
    color: '#111827',
  },

  maskedInputPlaceholder: {
    color: '#9CA3AF',
  },

  maskedInputField: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 14,
    color: 'transparent',
    backgroundColor: 'transparent',
    fontSize: 15,
    letterSpacing: 0.8,
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'monospace',
    }),
  },

  inputDisabled: {
    backgroundColor: '#F3F4F6',
    color: '#4B5563',
  },

  formError: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
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
