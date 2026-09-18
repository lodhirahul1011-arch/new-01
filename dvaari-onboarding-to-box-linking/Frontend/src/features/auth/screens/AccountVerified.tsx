import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  StatusBar,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation/RootNavigator';
import {
  SCREEN_PADDING_H,
  BOTTOM_BUTTON_GAP,
  PRIMARY_BUTTON,
} from '../../../theme/metrics';
import ResponsiveScrollScreen from '../../../components/layout/ResponsiveScrollScreen';
import VerifiedSvg from '../../../assets/icons/link-device/verified.svg';
import { useTheme } from '../../../theme/ThemeContext';
import DarkGlow from '../../../components/ui/DarkGlow';
import { useResponsive } from '../../../theme/responsive';
type Props = NativeStackScreenProps<RootStackParamList, 'AccountVerified'>;

const THEME = {
  light: {
    background: '#F3F4F6',
    ringBg: '#E6F6EC',
    title: '#000000',
    subtitle: '#6B7280',
  },
  dark: {
    background: '#0F0F10',
    ringBg: 'rgba(34,197,94,0.16)',
    title: '#FFFFFF',
    subtitle: 'rgba(255,255,255,0.65)',
  },
};

export default function AccountVerified({ navigation }: Props) {
  // No Figma frame exists for this screen, so it isn't built on the shared
  // 360-wide canvas system like the others — but it still scales off the same
  // clamped, orientation-stable factor, for its own dimensions as much as for
  // DarkGlow, so it holds together from a 320dp phone up to a tablet.
  const { width, scale, isLandscape } = useResponsive();
  const s = (n: number) => n * scale;
  const { isDark } = useTheme();
  const palette = isDark ? THEME.dark : THEME.light;
  const styles = useMemo(() => createStyles(scale), [scale]);

  const nextStep = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'RequestPermissions' }],
    });
  };

  return (
    <ResponsiveScrollScreen backgroundColor={palette.background}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />
      {isDark && <DarkGlow scale={scale} />}
      <View style={styles.container}>
        {/* Success Icon */}
        <View style={[styles.outerRing, { backgroundColor: palette.ringBg }]}>
          <View>
            <VerifiedSvg width={s(103)} height={s(103)} />
          </View>
        </View>

        <Text style={[styles.title, { color: palette.title }]}>Account Verified!</Text>

        <Text style={[styles.subtitle, { color: palette.subtitle }]}>
          Your account has been successfully verified.
        </Text>

        <Pressable
          style={[
            styles.primaryBtn,
            {
              width: Math.min(Math.max(width * 0.72, s(220)), s(308)),
              marginTop: isLandscape ? s(12) : 0,
            },
          ]}
          onPress={nextStep}
        >
          <Text style={styles.primaryBtnText}>Continue</Text>
        </Pressable>
      </View>
    </ResponsiveScrollScreen>
  );
}

function createStyles(scale: number) {
  const s = (n: number) => n * scale;

  return StyleSheet.create({
    container: {
      alignItems: 'center',
      paddingHorizontal: s(SCREEN_PADDING_H),
      paddingTop: s(72),
      paddingBottom: s(BOTTOM_BUTTON_GAP),
    },

    outerRing: {
      width: s(103),
      height: s(103),
      borderRadius: 999,
      backgroundColor: '#E6F6EC',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: s(28),
    },

    title: {
      fontSize: s(24),
      lineHeight: s(36),
      fontWeight: '600',
      color: '#000000',
      marginBottom: s(8),
    },

    subtitle: {
      fontSize: s(16),
      lineHeight: s(24),
      paddingHorizontal: s(20),
      color: '#6B7280',
      textAlign: 'center',
      marginBottom: s(40),
    },

    primaryBtn: {
      // minHeight, not height: the label grows with the OS font-size setting,
      // and a hard height would clip it at the larger accessibility steps.
      minHeight: s(PRIMARY_BUTTON.minHeight),
      paddingHorizontal: s(10),
      paddingVertical: s(12),
      borderRadius: s(PRIMARY_BUTTON.radius),
      backgroundColor: '#2362EB',
      alignItems: 'center',
      justifyContent: 'center',
    },

    primaryBtnText: {
      color: '#FFFFFF',
      fontSize: s(PRIMARY_BUTTON.fontSize),
      lineHeight: s(24),
      letterSpacing: -0.5,
      fontFamily: 'Satoshi-Medium',
    },
  });
}
