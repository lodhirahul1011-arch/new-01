import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { logs } from '../../services/logs';

type Props = {
  visible: boolean;
  title?: string;
  message: string;
  buttonText?: string;
  onClose: () => void;
};

export default function SuccessModal({
  visible,
  title = 'Success',
  message,
  buttonText = 'OK',
  onClose,
}: Props) {
  if (!visible) return null;

  const handleClose = () => {
    try {
      logs.info('[SuccessModal] confirmation acknowledged', { title });
      onClose();
    } catch (error) {
      logs.error('[SuccessModal] failed to close confirmation', {
        title,
        error,
      });
      throw error;
    }
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Text style={styles.icon}>{'\u2713'}</Text>
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>

        <Pressable style={styles.btn} onPress={handleClose}>
          <Text style={styles.btnText}>{buttonText}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 22,
    alignItems: 'center',
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 999,
    backgroundColor: '#ECFDF3',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  icon: { color: '#22C55E', fontSize: 30, fontWeight: '900' },

  title: { fontSize: 20, fontWeight: '900', color: '#111827' },
  message: {
    marginTop: 8,
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 22,
  },

  btn: {
    marginTop: 18,
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    alignSelf: 'stretch',
  },
  btnText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 15,
    textAlign: 'center',
  },
});
