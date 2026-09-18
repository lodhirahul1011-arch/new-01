import React, { ReactNode, useEffect } from 'react';
import { Modal, View, Text, StyleSheet, Pressable } from 'react-native';
import { logs } from '../../services/logs';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  children?: ReactNode;
  confirmDisabled?: boolean;
  confirmVariant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmModal({
  visible,
  title,
  message,
  confirmText = 'Delete',
  cancelText = 'Cancel',
  children,
  confirmDisabled = false,
  confirmVariant = 'danger',
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (visible) {
      logs.info('[ConfirmModal] opened', {
        title,
        confirmDisabled,
        confirmVariant,
      });
    }
  }, [confirmDisabled, confirmVariant, title, visible]);

  if (!visible) return null;

  const handleConfirm = () => {
    if (confirmDisabled) {
      logs.error('[ConfirmModal] blocked disabled confirm', {
        title,
        confirmVariant,
      });
      return;
    }
    logs.info('[ConfirmModal] confirm selected', { title, confirmVariant });
    onConfirm();
  };

  const handleCancel = () => {
    logs.info('[ConfirmModal] cancel selected', { title });
    onCancel();
  };

  return (
    <Modal
      animationType="fade"
      hardwareAccelerated
      onRequestClose={handleCancel}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          {children}

          <View style={styles.actions}>
            <Pressable style={styles.cancelBtn} onPress={handleCancel}>
              <Text style={styles.cancelText}>{cancelText}</Text>
            </Pressable>

            <Pressable
              disabled={confirmDisabled}
              style={[
                styles.confirmBtn,
                confirmVariant === 'danger' ? styles.dangerBtn : styles.primaryBtn,
                confirmDisabled && styles.confirmBtnDisabled,
              ]}
              onPress={handleConfirm}
            >
              <Text style={styles.confirmText}>{confirmText}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 22,
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    lineHeight: 21,
    color: '#6B7280',
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 18,
    gap: 10,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  cancelText: { color: '#475569', fontWeight: '800', fontSize: 13 },

  confirmBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  dangerBtn: {
    backgroundColor: '#EF4444',
  },
  primaryBtn: {
    backgroundColor: '#2563EB',
  },
  confirmBtnDisabled: {
    opacity: 0.5,
  },
  confirmText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 13,
  },
});
