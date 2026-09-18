import React, { useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import OtpInput from '../ui/OtpInput';
import { useAppTranslation } from '../../services/i18n';

type Props = {
  visible: boolean;
  destination: string;
  otpLength?: 4 | 6;
  loading?: boolean;
  onClose: () => void;
  onVerify: (code: string) => Promise<void> | void;
  onResend?: () => Promise<void> | void;
};

function maskDestination(destination: string) {
  if (!destination) return '';

  if (destination.includes('@')) {
    const [name, domain] = destination.split('@');
    const safeName =
      name.length <= 2 ? `${name[0] ?? ''}*` : `${name.slice(0, 2)}***`;
    return `${safeName}@${domain}`;
  }

  const digits = destination.replace(/\D/g, '');
  if (digits.length < 4) return destination;

  return `+${digits.slice(0, 2)} ${digits.slice(2)}`;
}

export default function VerifyCodeModal({
  visible,
  destination,
  otpLength = 4,
  loading = false,
  onClose,
  onVerify,
  onResend,
}: Props) {
  const { t } = useAppTranslation();
  const [code, setCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = useMemo(
    () => code.length === otpLength && !loading,
    [code, otpLength, loading],
  );

  const handleVerify = async () => {
    setCodeTouched(true);
    if (code.length !== otpLength) {
      setError(
        code.length === 0
          ? t('otp_required')
          : t('otp_digits_required', { otpLength }),
      );
      return;
    }

    setError('');
    await onVerify(code);
  };

  const handleResend = async () => {
    setError('');
    await onResend?.();
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
                  <View style={{ width: 28 }} />
                  <Text style={styles.title}>{t('verify_code')}</Text>
                  <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
                    <Text style={styles.closeText}>✕</Text>
                  </Pressable>
                </View>

                <Text style={styles.subtitle}>
                  {t('verify_code_subtitle')}
                </Text>
                <Text style={styles.destination}>{maskDestination(destination)}</Text>

                <View style={styles.otpWrap}>
                  <OtpInput
                    length={otpLength}
                    value={code}
                    onChange={value => {
                      setCode(value);
                      setCodeTouched(true);
                      setError('');
                    }}
                    errorText={error || (codeTouched && code.length === 0 ? t('otp_required') : '')}
                  />
                </View>

                <Pressable
                  style={[
                    styles.verifyBtn,
                    !canSubmit && styles.verifyBtnDisabled,
                  ]}
                  onPress={handleVerify}
                  disabled={!canSubmit}
                >
                  <Text style={styles.verifyText}>
                    {loading ? t('verifying') : t('verify_code')}
                  </Text>
                </Pressable>

                <View style={styles.resendRow}>
                  <Text style={styles.resendLabel}>{t('did_not_get_otp')} </Text>
                  <Pressable onPress={handleResend}>
                    <Text style={styles.resendLink}>{t('resend_code')}</Text>
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
    paddingTop: 20,
    paddingBottom: 22,
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },

  closeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  closeText: {
    fontSize: 24,
    color: '#6B7280',
    lineHeight: 24,
  },

  subtitle: {
    marginTop: 14,
    textAlign: 'center',
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },

  destination: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
  },

  otpWrap: {
    marginTop: 22,
    alignItems: 'center',
  },

  verifyBtn: {
    marginTop: 24,
    height: 56,
    borderRadius: 14,
    backgroundColor: '#2362EB',
    alignItems: 'center',
    justifyContent: 'center',
  },

  verifyBtnDisabled: {
    backgroundColor: '#9BB7F0',
  },

  verifyText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },

  resendRow: {
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },

  resendLabel: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
  },

  resendLink: {
    fontSize: 14,
    color: '#2362EB',
    fontWeight: '700',
  },
});
