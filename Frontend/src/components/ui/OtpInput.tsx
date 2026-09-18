import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, TextInput, StyleSheet, Text, Platform } from 'react-native';
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
  const inputsRef = useRef<Array<TextInput | null>>([]);
  const [internal, setInternal] = useState<string>('');

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
      inputsRef.current[0]?.focus();
    }, 250);
    return () => clearTimeout(t);
  }, [autoFocus]);

  const focusIndex = (i: number) => {
    const idx = Math.max(0, Math.min(length - 1, i));
    inputsRef.current[idx]?.focus();
  };

  const handleChangeAt = (i: number, text: string) => {
    // paste / fast input support
    const clean = text.replace(/\D/g, '');
    if (clean.length > 1) {
      const merged = (code.slice(0, i) + clean + code.slice(i + clean.length)).slice(0, length);
      setCode(merged);
      const nextIndex = Math.min(length - 1, i + clean.length);
      focusIndex(nextIndex);
      return;
    }

    const nextChar = clean ? clean[0] : '';
    const next = code.split('');
    next[i] = nextChar;
    const merged = next.join('').slice(0, length);
    setCode(merged);

    if (nextChar && i < length - 1) focusIndex(i + 1);
  };

  const handleKeyPressAt = (i: number, key: string) => {
    if (key !== 'Backspace') return;

    if (digits[i]) {
      // clear current
      const next = code.split('');
      next[i] = '';
      setCode(next.join(''));
      return;
    }
    // move back and clear previous
    if (i > 0) {
      const next = code.split('');
      next[i - 1] = '';
      setCode(next.join(''));
      focusIndex(i - 1);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.row, { gap: s(16) }]}>
        {digits.map((d, i) => (
          <TextInput
            key={i}
            ref={(r) => {
              inputsRef.current[i] = r;
            }}
            value={d}
            onChangeText={(t) => handleChangeAt(i, t)}
            onKeyPress={({ nativeEvent }) => handleKeyPressAt(i, nativeEvent.key)}
            style={[
              styles.box,
              {
                width: s(52),
                height: s(52),
                borderRadius: s(5),
                fontSize: s(32),
              },
              dark && styles.boxDark,
              !!errorText && styles.boxError,
            ]}
            keyboardType={Platform.select({ ios: 'number-pad', android: 'numeric' })}
            returnKeyType="done"
            textAlign="center"
            maxLength={i === 0 ? length : 1}
            importantForAutofill={i === 0 ? 'yes' : 'no'}
            autoComplete={i === 0 ? 'sms-otp' : 'off'}
            textContentType={i === 0 ? 'oneTimeCode' : 'none'}
            selectionColor={activeColor}
            autoCorrect={false}
            autoCapitalize="none"
          />
        ))}
      </View>

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
    row: { flexDirection: 'row', justifyContent: 'center' },

    box: {
      borderWidth: 0.45,
      borderColor: 'rgba(0,0,0,0.27)',
      backgroundColor: 'rgba(217,217,217,0.1)',
      fontFamily: 'Satoshi-Regular',
      textAlignVertical: 'center',
      includeFontPadding: false,
      padding: 0,
      color: 'rgba(34,34,34,0.79)',
    },
    boxDark: {
      borderColor: 'rgba(255,255,255,0.25)',
      backgroundColor: 'rgba(255,255,255,0.08)',
      color: 'rgba(255,255,255,0.9)',
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
