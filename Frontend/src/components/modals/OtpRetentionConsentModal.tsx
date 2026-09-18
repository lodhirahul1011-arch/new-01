import React, { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SvgProps } from 'react-native-svg';
import { logs } from '../../services/logs';
import { useTheme } from '../../theme/ThemeContext';
import { useUiScale } from '../../theme/responsive';
import RingOuter from '../../assets/icons/auth/otp-consent-ring-outer.svg';
import RingInner from '../../assets/icons/auth/otp-consent-ring-inner.svg';
import EncryptedIcon from '../../assets/icons/auth/otp-consent-encrypted.svg';
import LockIcon from '../../assets/icons/auth/otp-consent-lock.svg';
import ClockIcon from '../../assets/icons/auth/otp-consent-clock.svg';
import ViewOffIcon from '../../assets/icons/auth/otp-consent-view-off.svg';
import DividerLine from '../../assets/icons/auth/otp-consent-divider.svg';

// Figma node 2800:4748 ("Personal Details") — the OTP retention consent card
// drawn over the dimmed Personal Details form. Every number below is taken
// from that 360x812 artboard and multiplied through `s(n)`.

type Props = {
  visible: boolean;
  onAccept: () => void;
  onDismiss: () => void;
};

const BLUE = '#2362EB';
const TEXT = '#333333';

const HIGHLIGHTS: { key: string; Icon: React.FC<SvgProps>; lines: string[] }[] = [
  { key: 'stored', Icon: LockIcon, lines: ['Stored', 'Securely'] },
  { key: 'auto-delete', Icon: ClockIcon, lines: ['Auto-delete', '24 hours'] },
  { key: 'not-shared', Icon: ViewOffIcon, lines: ['Not shared', 'with anyone'] },
];

export default function OtpRetentionConsentModal({ visible, onAccept, onDismiss }: Props) {
  const styles = useStyles();
  const scale = useUiScale();
  const s = (n: number) => n * scale;
  const { isDark } = useTheme();

  const handleAccept = () => {
    logs.info('[OtpRetentionConsentModal] user accepted OTP retention');
    onAccept();
  };

  const handleDismiss = () => {
    logs.info('[OtpRetentionConsentModal] dismissed without accepting');
    onDismiss();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleDismiss}
    >
      <View style={[styles.overlay, isDark && styles.overlayDark]}>
        <View style={styles.card} accessibilityViewIsModal>
          <View style={styles.badge}>
            <RingOuter width={s(54)} height={s(54)} style={StyleSheet.absoluteFill} />
            <RingInner width={s(44.03)} height={s(44.03)} />
            <View style={styles.badgeIcon}>
              <EncryptedIcon width={s(24)} height={s(24)} />
            </View>
          </View>

          <Text style={styles.title} accessibilityRole="header">
            We Keep your OTP for 24 hours
          </Text>
          <Text style={styles.body}>
            This helps us ensure your deliveries without delays. After 24 hours, your OTP is
            permanently deleted
          </Text>

          <View style={styles.highlights}>
            {HIGHLIGHTS.map(({ key, Icon, lines }, index) => (
              <React.Fragment key={key}>
                {index > 0 && (
                  <View style={styles.dividerSlot}>
                    <DividerLine width={s(37)} height={s(0.55)} style={styles.dividerLine} />
                  </View>
                )}
                <View style={styles.highlight} accessible accessibilityLabel={lines.join(' ')}>
                  <Icon width={s(12)} height={s(12)} />
                  <Text style={styles.highlightText}>{lines.join('\n')}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>

          <Pressable
            onPress={handleAccept}
            accessibilityRole="button"
            style={({ pressed }) => [styles.acceptBtn, pressed && styles.acceptBtnPressed]}
          >
            <Text style={styles.acceptBtnText}>I’m okay with this</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function useStyles() {
  const scale = useUiScale();
  return useMemo(() => createStyles(scale), [scale]);
}

function createStyles(scale: number) {
  const s = (n: number) => n * scale;

  return StyleSheet.create({
    // Figma dims the form by dropping it to 29% opacity on #E5E5E5; a 71%
    // #E5E5E5 wash over the live screen reproduces that.
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(229,229,229,0.71)',
      alignItems: 'center',
      justifyContent: 'center',
      // Card centre sits 5.5 below the artboard centre.
      paddingTop: s(11),
    },
    overlayDark: {
      backgroundColor: 'rgba(0,0,0,0.6)',
    },
    card: {
      width: s(253),
      backgroundColor: '#FFFFFF',
      borderRadius: s(17),
      paddingTop: s(17),
      paddingBottom: s(18),
      alignItems: 'center',
    },
    badge: {
      width: s(54),
      height: s(54),
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeIcon: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      marginTop: s(15),
      width: s(192),
      fontFamily: 'Satoshi-Medium',
      fontSize: s(13),
      color: TEXT,
      textAlign: 'center',
    },
    body: {
      marginTop: s(4),
      width: s(194),
      fontFamily: 'Satoshi-Regular',
      fontSize: s(10),
      lineHeight: s(14),
      color: TEXT,
      textAlign: 'center',
    },
    highlights: {
      marginTop: s(15),
      width: s(212),
      height: s(48),
      borderRadius: s(6),
      backgroundColor: 'rgba(35,98,235,0.15)',
      flexDirection: 'row',
      paddingHorizontal: s(6),
    },
    highlight: {
      flex: 1,
      alignItems: 'center',
      paddingTop: s(8),
    },
    highlightText: {
      marginTop: s(4),
      width: s(35),
      fontFamily: 'Satoshi-Medium',
      fontSize: s(6),
      lineHeight: s(8),
      color: BLUE,
      textAlign: 'center',
    },
    // The divider asset is a horizontal 37-long hairline; Figma rotates it
    // -90deg to stand it between columns.
    dividerSlot: {
      width: s(0.55),
      height: s(37),
      marginTop: s(6),
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'visible',
    },
    dividerLine: {
      transform: [{ rotate: '-90deg' }],
    },
    acceptBtn: {
      marginTop: s(15),
      width: s(171),
      height: s(27),
      borderRadius: s(5.5),
      backgroundColor: BLUE,
      alignItems: 'center',
      justifyContent: 'center',
    },
    acceptBtnPressed: {
      opacity: 0.85,
    },
    acceptBtnText: {
      fontFamily: 'Satoshi-Medium',
      fontSize: s(13),
      color: '#FFFFFF',
    },
  });
}
