import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  PRIVACY_POLICY_URL,
  TERMS_CONDITIONS_URL,
} from '../../../config/env';
import { logs } from '../../../services/logs';

type Props = {
  checked: boolean;
  error?: string;
  onChange: (checked: boolean) => void;
};

async function openLegalUrl(label: string, url: string) {
  try {
    logs.info('[signup] legal link opening', { label, url });
    await Linking.openURL(url);
    logs.info('[signup] legal link opened', { label });
  } catch (error) {
    logs.error('[signup] legal link failed', { label, error: String(error) });
  }
}

export default function LegalAgreementCheckbox({
  checked,
  error,
  onChange,
}: Props) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        <Pressable
          onPress={() => {
            logs.info('[signup] legal agreement changed', { checked: !checked });
            onChange(!checked);
          }}
          hitSlop={8}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
        >
          <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
            {checked ? <Text style={styles.checkmark}>✓</Text> : null}
          </View>
        </Pressable>

        <View style={styles.copyWrap}>
          <Text style={styles.copy}>I agree to the </Text>
          <Pressable
            hitSlop={8}
            onPress={() => openLegalUrl('privacy_policy', PRIVACY_POLICY_URL)}
          >
            <Text
              style={styles.link}
            >
              Privacy Policy
            </Text>
          </Pressable>
          <Text style={styles.copy}> and </Text>
          <Pressable
            hitSlop={8}
            onPress={() => openLegalUrl('terms_conditions', TERMS_CONDITIONS_URL)}
          >
            <Text style={styles.link}>Terms & Conditions</Text>
          </Pressable>
        </View>
      </View>

      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 10,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },

  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },

  checkboxChecked: {
    backgroundColor: '#2362EB',
    borderColor: '#2362EB',
  },

  checkmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 16,
  },

  copyWrap: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },

  copy: {
    color: '#4B5563',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },

  link: {
    color: '#184FBF',
    fontWeight: '900',
  },

  errorText: {
    marginTop: 6,
    marginLeft: 32,
    color: '#EA8080',
    fontSize: 12,
    fontWeight: '600',
  },
});
