import React, { useMemo } from 'react';
import { Camera } from 'react-native-vision-camera';
import {
  Image,
  Linking,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  ScrollView,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation/RootNavigator';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppAlert as Alert } from '../../../components/modals/AppAlert';
import ArrowSvg from '../../../assets/icons/common/arrow-left-black.svg';
import ArrowWhiteIcon from '../../../assets/icons/common/arrow-left-white.svg';
import CameraStepIcon from '../../../assets/icons/auth/step-camera.svg';
import QrStepIcon from '../../../assets/icons/auth/step-qr.svg';
import LinkStepIcon from '../../../assets/icons/auth/step-link-group.svg';
import StepCircle from '../../../assets/icons/auth/step-circle.svg';
import StepCircleDark from '../../../assets/icons/auth/step-circle-dark.svg';
import StepConnector1 from '../../../assets/icons/auth/step-connector-1.svg';
import StepConnector1White from '../../../assets/icons/auth/step-connector-1-white.svg';
import StepConnector2 from '../../../assets/icons/auth/step-connector-2.svg';
import StepConnector2White from '../../../assets/icons/auth/step-connector-2-white.svg';
import LinkIcon from '../../../assets/icons/auth/link-icon.svg';
import ShieldSecuredIcon from '../../../assets/icons/auth/shield-secured.svg';
import { logs } from '../../../services/logs';
import { BOTTOM_BUTTON_GAP } from '../../../theme/metrics';
import { useTheme } from '../../../theme/ThemeContext';
import DarkGlow from '../../../components/ui/DarkGlow';
import { useCanvasScreen, useUiScale } from '../../../theme/responsive';

type Props = NativeStackScreenProps<RootStackParamList, 'DeviceSetup'>;

// Every number below is copied 1:1 from Figma's "Dvaari Box" frame (fileKey
// 0ZAjL8CnVgprbKaBMIjUqJ, node 414:5379) on a 360x812 canvas, scaled by a
// single width-based factor — same technique as Otp/Login.
const CANVAS_W = 360;
const HEADER_TOP = 28; // 72 (Figma) - 44 (status bar, already covered by SafeAreaView)
const PAGE_PAD_H = 28; // this frame insets its content further than SCREEN_PADDING_H

// The three step pills share a right edge (Figma x=332) and stagger only on
// the left, so each is right-aligned with its own Figma width rather than
// absolutely positioned. Circle diameter (60) sets the row height; the pill
// behind it is 58 and inset 1px vertically.
const STEP_ROW_H = 60;
const STEP_ROW_GAP = 26.5; // Figma circle tops: 374 / 460.5 / 547
const PILL_H = 58;

// Minimum height for the hero image, which flexes to absorb spare space.
const HERO_FLOOR = 48;

const THEME = {
  light: {
    background: '#F3F4FC',
    backBtnBg: '#F2F2F2',
    backBtnBorder: 'rgba(0,0,0,0.12)',
    title: 'rgba(0,0,0,0.8)',
    subtitle: 'rgba(0,0,0,0.6)',
    pillBg: '#FDFCFE',
    stepTitle: '#000000',
    stepCaption: 'rgba(0,0,0,0.65)',
    secureBg: 'rgba(35,98,235,0.03)',
    secureBorder: 'rgba(0,0,0,0.19)',
    secureTitle: 'rgba(0,0,0,0.78)',
    secureSubtitle: '#333333',
  },
  // Verified against the real Figma dark frame (node 360:5978, "Connect
  // Device") — every value below is copied 1:1 from it, not derived.
  dark: {
    background: '#0F0F10',
    backBtnBg: 'rgba(255,255,255,0.15)',
    backBtnBorder: 'rgba(255,255,255,0.15)',
    title: 'rgba(255,255,255,0.96)',
    subtitle: 'rgba(255,255,255,0.88)',
    pillBg: '#1E1E1E',
    stepTitle: '#FFFFFF',
    stepCaption: 'rgba(255,255,255,0.65)',
    secureBg: '#1E1E1E',
    secureBorder: 'rgba(255,255,255,0.23)',
    secureTitle: 'rgba(255,255,255,0.78)',
    secureSubtitle: 'rgba(255,255,255,0.55)',
  },
};

export default function DeviceSetup({ navigation, route }: Props) {
  const styles = useStyles();
  const scale = useUiScale(CANVAS_W);
  const s = (n: number) => n * scale;
  const { canvasMinHeight } = useCanvasScreen();
  const { isDark } = useTheme();
  const palette = isDark ? THEME.dark : THEME.light;
  const { type, from } = route.params;

  // This screen used to squeeze its gaps down to 35% of the Figma value on a
  // short handset, because a fixed-height page had no way to reveal a button
  // pushed off the bottom. It scrolls now, so every gap keeps the value the
  // design gives it and the page simply runs past the viewport when it has to.
  const ms = s;

  const isBox = type === 'box';
  const title = isBox ? 'Connect Your DvaariBox' : 'Connect Your Device';
  const subtitle = isBox
    ? 'Scan the QR code displayed on your Dvaari box to complete the setup'
    : 'Scan the QR code displayed on your Dvaari Device to connect your mobile app';

  // pillW / textGap come straight from Figma's per-step offsets — the designer
  // nudged each row independently rather than using one shared gap.
  const steps = [
    {
      icon: CameraStepIcon,
      pillW: 300,
      textGap: 11,
      title: isBox
        ? 'Open the Camera and Scan QR\nor upload QR'
        : 'Open the Camera and Scan QR and Upload QR',
      caption: 'On your phone',
    },
    {
      icon: QrStepIcon,
      pillW: 270,
      textGap: 9,
      title: 'Point your camera at the QR code',
      caption: 'On the Device',
    },
    {
      icon: LinkStepIcon,
      pillW: 296,
      textGap: 7,
      title: 'Wait for the connection to establish',
      caption: 'it will only take a few seconds',
    },
  ];

  const buttonText = isBox ? 'Link a Box' : 'Link a Device';

  const handleBack = () => {
    // Figma always shows this arrow, regardless of how the screen was
    // reached. Most paths here arrive via navigation.reset() (Splash,
    // PersonalDetails, Otp, AccountVerified, QrScanner), which wipes the
    // back stack — same situation PersonalDetails' own back button already
    // handles by resetting to Login instead of doing nothing.
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  const handlePress = async () => {
    try {
      let status = await Camera.getCameraPermissionStatus();

      if (status !== 'granted') {
        status = await Camera.requestCameraPermission();
      }

      if (status === 'granted') {
        navigation.navigate('QrScanner', {
          type,
          from,
        });
        return;
      }

      Alert.alert(
        'Camera Permission Required',
        'Please enable camera permission from app settings to scan the QR code.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Go to App Settings',
            onPress: () => Linking.openSettings(),
          },
        ],
      );
    } catch (error) {
      logs.error('Camera permission error', error);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />
      {isDark && <DarkGlow scale={scale} />}
      <ScrollView
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: s(HEADER_TOP),
            paddingHorizontal: s(PAGE_PAD_H),
            minHeight: canvasMinHeight,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.topBar, { height: s(26) }]}>
          {/* Figma only shows this arrow on the "Connect Device" frame
              (node 360:5978) — the "Dvaari Box" frame (414:5379, the second
              step, reached right after the device step already succeeded)
              has no back button at all, only Skip. */}
          {!isBox ? (
            <Pressable
              onPress={handleBack}
              hitSlop={10}
              style={{
                width: s(26),
                height: s(26),
                borderRadius: s(13),
                backgroundColor: palette.backBtnBg,
                borderWidth: s(0.5),
                borderColor: palette.backBtnBorder,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isDark ? <ArrowWhiteIcon width={s(16)} height={s(16)} /> : <ArrowSvg width={s(16)} height={s(16)} />}
            </Pressable>
          ) : (
            <View />
          )}

          {isBox && from === 'setup' ? (
            <Pressable
              onPress={() => navigation.replace('Permissions')}
              style={{
                width: s(71),
                height: s(26),
                borderRadius: s(20),
                backgroundColor: 'rgba(255,255,255,0.19)',
                borderWidth: s(1),
                borderColor: '#2362EB',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={[styles.skipText, { fontSize: s(14) }]}>Skip</Text>
            </Pressable>
          ) : (
            <View />
          )}
        </View>

        {/* The page never scrolls, so the hero is the one element that flexes:
            it absorbs whatever height a device has spare above or below
            Figma's 812pt canvas, while every other block keeps its
            width-scaled size. Same approach as Login. */}
        <View style={[styles.heroWrap, { marginTop: ms(3), minHeight: s(HERO_FLOOR) }]}>
          <Image
            source={require('../../../assets/images/auth/connect-device-hero.png')}
            style={{ width: s(190.6), height: '100%' }}
            resizeMode="contain"
          />
        </View>

        <Text style={[styles.title, { marginTop: ms(30), fontSize: s(30), color: palette.title }]}>
          {title}
        </Text>

        <Text
          style={[
            styles.subtitle,
            { marginTop: ms(10), fontSize: s(13), width: s(239), color: palette.subtitle },
          ]}
        >
          {subtitle}
        </Text>

        <View style={[styles.steps, { marginTop: ms(21), gap: s(STEP_ROW_GAP) }]}>
          {steps.map(step => {
            const StepIcon = step.icon;
            return (
              <View
                key={step.caption}
                style={[
                  styles.stepRow,
                  { width: s(step.pillW), height: s(STEP_ROW_H) },
                ]}
              >
                <View
                  style={[
                    styles.stepPill,
                    { top: s(1), height: s(PILL_H), borderRadius: s(41), backgroundColor: palette.pillBg },
                  ]}
                />
                {isDark ? <StepCircleDark width={s(60)} height={s(60)} /> : <StepCircle width={s(60)} height={s(60)} />}
                <View style={[styles.stepIcon, { left: s(15), top: s(15) }]}>
                  <StepIcon width={s(30)} height={s(30)} />
                </View>
                <View style={{ marginLeft: s(step.textGap), width: s(147) }}>
                  <Text
                    style={[
                      styles.stepTitle,
                      { fontSize: s(11), lineHeight: s(14), color: palette.stepTitle },
                    ]}
                  >
                    {step.title}
                  </Text>
                  <Text
                    style={[
                      styles.stepCaption,
                      { fontSize: s(9), lineHeight: s(11), marginTop: s(2), color: palette.stepCaption },
                    ]}
                  >
                    {step.caption}
                  </Text>
                </View>
              </View>
            );
          })}

          {/* Dashed connectors linking each circle to the next. Positioned off
              the steps container's own origin (Figma x=28, y=374) so they track
              the rows at any scale. */}
          <View
            style={[styles.connector, { left: s(35), top: s(57) }]}
            pointerEvents="none"
          >
            {isDark ? (
              <StepConnector1White width={s(22)} height={s(28)} />
            ) : (
              <StepConnector1 width={s(22)} height={s(28)} />
            )}
          </View>
          <View
            style={[
              styles.connector,
              { left: s(37), top: s(146), width: s(32), height: s(28) },
            ]}
            pointerEvents="none"
          >
            {/* Figma rotates the glyph inside a fixed 32x28 box, so the
                rotation belongs on the artwork, not on its container. */}
            {isDark ? (
              <StepConnector2White width={s(28)} height={s(32)} style={styles.connectorRotated} />
            ) : (
              <StepConnector2 width={s(28)} height={s(32)} style={styles.connectorRotated} />
            )}
          </View>
        </View>

        <View
          style={[
            styles.secureNote,
            {
              marginTop: ms(32),
              height: s(52),
              borderRadius: s(5),
              paddingLeft: s(16),
              gap: s(5),
              backgroundColor: palette.secureBg,
              borderColor: palette.secureBorder,
            },
          ]}
        >
          <ShieldSecuredIcon width={s(28)} height={s(28)} />
          <View style={styles.secureTextWrap}>
            <Text style={[styles.secureTitle, { fontSize: s(11), color: palette.secureTitle }]}>
              Your Connection is secure
            </Text>
            <Text
              style={[
                styles.secureSubtitle,
                { fontSize: s(10), marginTop: s(2), color: palette.secureSubtitle },
              ]}
            >
              we protect your data and privacy.
            </Text>
          </View>
        </View>

        <Pressable
          style={[
            styles.primaryBtn,
            { marginTop: ms(24), height: s(39), borderRadius: s(26), gap: s(8) },
          ]}
          onPress={handlePress}
        >
          <LinkIcon width={s(20)} height={s(20)} />
          <Text style={[styles.primaryBtnText, { fontSize: s(16) }]}>
            {buttonText}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function useStyles() {
  const scale = useUiScale();
  return useMemo(() => createStyles(scale), [scale]);
}

function createStyles(_scale: number) {
  // Nothing in this sheet is dimensional — every size on this screen is
  // applied inline through the component's own scaled s() helper.
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: '#F3F4FC',
    },
    // flexGrow so it fills a tall viewport but can also exceed a short one and
    // scroll. SafeAreaView already insets for the device's real bottom, so this
    // only adds a small breathing-room gap below the primary button.
    container: {
      flexGrow: 1,
      paddingBottom: BOTTOM_BUTTON_GAP,
    },
    heroWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    skipText: {
      fontFamily: 'Satoshi-Medium',
      color: '#2362EB',
    },
    title: {
      fontFamily: 'Satoshi-Medium',
      color: 'rgba(0,0,0,0.8)',
      textAlign: 'center',
    },
    subtitle: {
      fontFamily: 'Satoshi-Medium',
      textAlign: 'center',
      color: 'rgba(0,0,0,0.6)',
      alignSelf: 'center',
    },
    steps: {
      width: '100%',
      position: 'relative',
    },
    stepRow: {
      // Figma staggers the pills on the left only — all three end at x=332.
      alignSelf: 'flex-end',
      flexDirection: 'row',
      alignItems: 'center',
    },
    stepPill: {
      position: 'absolute',
      left: 0,
      right: 0,
      backgroundColor: '#FDFCFE',
    },
    stepIcon: {
      position: 'absolute',
    },
    stepTitle: {
      fontFamily: 'Satoshi-Medium',
      color: '#000000',
    },
    stepCaption: {
      fontFamily: 'Satoshi-Regular',
      color: 'rgba(0,0,0,0.65)',
    },
    connector: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center',
    },
    connectorRotated: {
      transform: [{ rotate: '90deg' }],
    },
    secureNote: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '100%',
      backgroundColor: 'rgba(35,98,235,0.03)',
      borderWidth: 0.5,
      borderColor: 'rgba(0,0,0,0.19)',
    },
    secureTextWrap: {
      flex: 1,
    },
    secureTitle: {
      fontFamily: 'Satoshi-Medium',
      color: 'rgba(0,0,0,0.78)',
    },
    secureSubtitle: {
      fontFamily: 'Satoshi-Regular',
      color: '#333333',
    },
    primaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      backgroundColor: '#2362EB',
    },
    primaryBtnText: {
      color: '#FFFFFF',
      fontFamily: 'Satoshi-Bold',
    },
  });
}
