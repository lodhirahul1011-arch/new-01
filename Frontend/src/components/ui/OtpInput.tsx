import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, TextInput, StyleSheet, Text, Platform, Pressable } from 'react-native';
import { useUiScale } from '../../theme/responsive';

type Props = {
  length?: number; // default 4
  value?: string;  // controlled optional
  onChange?: (code: string) => void;
  autoFocus?: boolean;
  errorText?: string;
  activeColor?: string;
  // Multiplies every box dimension/font size below (all copied 1:1 from
  // Figma at its 360px-wide reference canvas). Defaults to 1 so existing
  // callers (e.g. VerifyCodeModal) render unchanged; screens built against
  // that same Figma canvas should pass their own width-based scale factor,
  // or these stay pinned to their exact-360px size and drift out of
  // proportion with the rest of the screen on any other width.
  scale?: number;
  // Dark-mode styling — defaults to false so existing light-only callers
  // (e.g. VerifyCodeModal) render unchanged.
  dark?: boolean;
};

export default function OtpInput({
  length = 4,
  value,
  onChange,
  autoFocus = true,
  errorText,
  activeColor = '#2362EB',
  scale = 1,
  dark = false,
}: Props) {
  const styles = useStyles();
  const s = (n: number) => n * scale;
  const inputRef = useRef<TextInput | null>(null);
  const [internal, setInternal] = useState<string>('');
  const [focused, setFocused] = useState(false);

  const code = value ?? internal;

  const digits = useMemo(() => {
    const arr = Array.from({ length }, (_, i) => code[i] ?? '');
    return arr;
  }, [code, length]);

  const setCode = (next: string) => {
    const clean = next.replace(/\D/g, '').slice(0, length);
    if (value === undefined) setInternal(clean);
    onChange?.(clean);
  };

  useEffect(() => {
    if (!autoFocus) return;
    const t = setTimeout(() => {
      inputRef.current?.focus();
    }, 250);
    return () => clearTimeout(t);
  }, [autoFocus]);

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="none"
        onPress={() => inputRef.current?.focus()}
        style={[styles.row, { gap: s(16) }]}
      >
        {digits.map((d, i) => {
          const isActive = focused && i === Math.min(code.length, length - 1);
          return (
            <View
              key={i}
              style={[
                styles.box,
                {
                  width: s(52),
                  height: s(52),
                  borderRadius: s(5),
                },
                dark && styles.boxDark,
                isActive && { borderColor: activeColor },
                !!errorText && styles.boxError,
              ]}
            >
              <Text
                style={[
                  styles.digit,
                  dark && styles.digitDark,
                  { fontSize: s(32) },
                ]}
              >
                {d}
              </Text>
            </View>
          );
        })}
        <TextInput
          ref={inputRef}
          value={code}
          onChangeText={setCode}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={styles.autofillInput}
          keyboardType={Platform.select({ ios: 'number-pad', android: 'numeric' })}
          returnKeyType="done"
          maxLength={length}
          importantForAutofill="yes"
          autoComplete="sms-otp"
          textContentType="oneTimeCode"
          selectionColor="transparent"
          autoCorrect={false}
          autoCapitalize="none"
          caretHidden
          accessibilityLabel={`${length} digit verification code`}
        />
      </Pressable>

      {!!errorText && (
        <Text style={[styles.error, dark && styles.errorDark, { fontSize: s(12) }]}>
          {errorText}
        </Text>
      )}
    </View>
  );
}

function useStyles() {
  const scale = useUiScale();
  return useMemo(() => createStyles(scale), [scale]);
}

function createStyles(scale: number) {
  const s = (n: number) => n * scale;

  return StyleSheet.create({
    wrap: { width: '100%', alignItems: 'center' },
    row: { flexDirection: 'row', justifyContent: 'center', position: 'relative' },

    box: {
      borderWidth: 0.45,
      borderColor: 'rgba(0,0,0,0.27)',
      backgroundColor: 'rgba(217,217,217,0.1)',
      fontFamily: 'Satoshi-Regular',
      textAlignVertical: 'center',
      includeFontPadding: false,
      alignItems: 'center',
      justifyContent: 'center',
    },
    digit: {
      fontFamily: 'Satoshi-Regular',
      color: 'rgba(34,34,34,0.79)',
    },
    boxDark: {
      borderColor: 'rgba(255,255,255,0.25)',
      backgroundColor: 'rgba(255,255,255,0.08)',
    },
    digitDark: {
      color: 'rgba(255,255,255,0.9)',
    },
    autofillInput: {
      ...StyleSheet.absoluteFillObject,
      opacity: 0.01,
      color: 'transparent',
      padding: 0,
    },
    boxError: {
      borderColor: '#F05D5D',
    },
    error: {
      marginTop: s(10),
      color: 'rgba(239,6,6,0.63)',
      fontFamily: 'Satoshi-Regular',
      textAlign: 'center',
    },
    errorDark: {
      color: '#F27C7C',
    },
  });
}
