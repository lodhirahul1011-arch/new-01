import React, { useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAppTranslation } from '../../services/i18n';

type Props = {
  visible: boolean;
  appName: string;
  loading?: boolean;
  onClose: () => void;
  onSendCode: (identifier: string) => Promise<void> | void;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ConnectAccountModal({
  visible,
  appName,
  loading = false,
  onClose,
  onSendCode,
}: Props) {
  const { t } = useAppTranslation();
  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState<string>('');

  const isValid = useMemo(() => {
    const value = identifier.trim();
    if (!value) return false;

    const isEmail = EMAIL_REGEX.test(value);
    const digits = value.replace(/\D/g, '');
    const isPhone = digits.length >= 10;

    return isEmail || isPhone;
  }, [identifier]);

  const handleSend = async () => {
    if (!isValid) {
      setError(t('connect_identifier_invalid'));
      return;
    }

    setError('');
    await onSendCode(identifier.trim());
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.sheetWrap}
            >
              <View style={styles.sheet}>
                <View style={styles.topRow}>
                  <Text style={styles.title}>
                    {t('connect_app_title', { appName })}
                  </Text>

                  <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
                    <Text style={styles.closeText}>✕</Text>
                  </Pressable>
                </View>

                <Text style={styles.subtitle}>
                  {t('connect_app_subtitle')}
                </Text>

                <TextInput
                  value={identifier}
                  onChangeText={text => {
                    setIdentifier(text);
                    setError('');
                  }}
                  placeholder={t('enter_email_or_phone')}
                  placeholderTextColor="#9CA3AF"
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                />

                <Text style={styles.helper}>
                  {t('connect_app_helper')}
                </Text>

                {!!error && <Text style={styles.error}>{error}</Text>}

                <View style={styles.actions}>
                  <Pressable style={styles.cancelBtn} onPress={onClose}>
                    <Text style={styles.cancelText}>{t('cancel')}</Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.sendBtn,
                      (!isValid || loading) && styles.sendBtnDisabled,
                    ]}
                    onPress={handleSend}
                    disabled={!isValid || loading}
                  >
                    <Text style={styles.sendText}>
                      {loading ? t('sending') : t('send_code')}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(17,24,39,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },

  sheetWrap: {
    width: '100%',
  },

  sheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },

  title: {
    flex: 1,
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },

  closeBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },

  closeText: {
    fontSize: 24,
    color: '#6B7280',
    fontWeight: '400',
    lineHeight: 24,
  },

  subtitle: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 22,
    color: '#6B7280',
    fontWeight: '500',
  },

  input: {
    marginTop: 20,
    height: 62,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },

  helper: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 20,
    color: '#6B7280',
    fontWeight: '500',
  },

  error: {
    marginTop: 8,
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '600',
  },

  actions: {
    marginTop: 22,
    flexDirection: 'row',
    gap: 14,
  },

  cancelBtn: {
    flex: 1,
    height: 56,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },

  cancelText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
  },

  sendBtn: {
    flex: 1.45,
    height: 56,
    borderRadius: 14,
    backgroundColor: '#2362EB',
    alignItems: 'center',
    justifyContent: 'center',
  },

  sendBtnDisabled: {
    backgroundColor: '#9BB7F0',
  },

  sendText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});