import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Linking,
  useWindowDimensions,
  Vibration,
} from 'react-native';

import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
} from 'react-native-vision-camera';
import Svg, { Path } from 'react-native-svg';
import { launchImageLibrary } from 'react-native-image-picker';
import RNQRGenerator from 'rn-qr-generator';

import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation/RootNavigator';
import { useAppDispatch } from '../../../store/hooks';
import { authApi, useLinkDeviceMutation } from '../../../services/api/authApi';
import { useClaimDevicePairingMutation } from '../../../services/api/deviceSetupApi';
import { getAccessToken, getRefreshToken, setTokens } from '../../../services/storage/tokenStorage';
import { API_BASE_URL, DEMO_ONBOARDING_WALKTHROUGH } from '../../../config/env';
import { logs } from '../../../services/logs';
import ScanedSvg from '../../../assets/icons/link-device/scaned.svg';
import FlashSvg from '../../../assets/icons/link-device/flash.svg';
import GallerySvg from '../../../assets/icons/link-device/gallery.svg';
import { SCREEN_PADDING_H } from '../../../theme/metrics';
import { useUiScale } from '../../../theme/responsive';

type Props = NativeStackScreenProps<RootStackParamList, 'QrScanner'>;

// Every number below is copied 1:1 from the Figma frames (fileKey
// 0ZAjL8CnVgprbKaBMIjUqJ, "Qr Code of Box" nodes 319:2570 scanning /
// 319:2717 success), a 360x812 canvas, scaled by a single width-based
// factor — same technique as Otp/Login. The "Upload QR" pill picks a QR
// from the photo gallery via react-native-image-picker, then decodes it
// with rn-qr-generator (react-native-vision-camera only scans live frames).
const CANVAS_W = 360;

function getApiErrorMessage(error: unknown) {
  const data = (error as { data?: { error?: string; message?: string } })?.data;
  return data?.error || data?.message || 'Could not link the device. Please try again.';
}

function celebrateAndNavigate(handleNavigation: () => void) {
  Vibration.vibrate(150);

  setTimeout(() => {
    handleNavigation();
  }, 1200);
}

type ParsedQrPayload = {
  qrToken: string;
  apiBaseUrl?: string;
  type?: string;
};

function normalizeBaseUrl(value?: string) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function parseQrPayload(value: string): ParsedQrPayload {
  const trimmedValue = String(value || '').trim();

  if (!trimmedValue) {
    throw new Error('Scanned QR code is empty.');
  }

  try {
    const parsed = JSON.parse(trimmedValue) as ParsedQrPayload;
    if (parsed && typeof parsed.qrToken === 'string' && parsed.qrToken.trim()) {
      return {
        qrToken: parsed.qrToken.trim(),
        apiBaseUrl: normalizeBaseUrl(parsed.apiBaseUrl),
        type: parsed.type,
      };
    }
  } catch {
    // Backward compatibility for older QR codes that only contain the token.
  }

  return { qrToken: trimmedValue };
}

function HeaderBackIcon({ size = 22 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 12H20"
        stroke="#FFFFFF"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M9 7C9 7 4 10.6824 4 12C4 13.3176 9 17 9 17"
        stroke="#FFFFFF"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}


function isTabletPairingQr(payload: ParsedQrPayload) {
  return payload.type === 'tablet_pairing' || Boolean(payload.apiBaseUrl);
}

// Refreshes via our own backend (API_BASE_URL) — tokens are always issued
// there regardless of which host ends up verifying them — and persists the
// result the same way baseQueryWithReauth does for every RTK Query call.
async function refreshAccessTokenDirect(): Promise<string | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) return null;

    const payload = await response.json().catch(() => null);
    const accessToken = payload?.accessToken as string | undefined;
    if (!accessToken) return null;

    await setTokens(accessToken, (payload?.refreshToken as string | undefined) || refreshToken);
    return accessToken;
  } catch (error) {
    logs.error('[qr-scanner] tablet pairing token refresh failed', String(error));
    return null;
  }
}

function isExpiredTokenResponse(status: number, payload: any) {
  if (status === 401) return true;
  const message = String(payload?.error || payload?.message || '').toLowerCase();
  return message.includes('expired') || message.includes('invalid token') || message.includes('jwt');
}

async function claimTabletPairingDirect(
  qrToken: string,
  apiBaseUrl: string,
  displayName?: string,
) {
  const claim = async (accessToken: string | null) => {
    const response = await fetch(`${apiBaseUrl}/api/v1/tablet/pairing/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        qrToken,
        ...(displayName ? { displayName } : {}),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  };

  // The QR decides which server we claim against, and it is frequently NOT
  // the backend this app is signed in to. Log both so a token rejection is
  // immediately diagnosable instead of surfacing as a bare "Invalid/Expired
  // token" from the remote host's auth middleware.
  const isForeignHost = apiBaseUrl !== API_BASE_URL;
  logs.info('[qr-scanner] claiming tablet pairing', {
    claimHost: apiBaseUrl,
    signedInHost: API_BASE_URL,
    isForeignHost,
  });

  let accessToken = await getAccessToken();
  let { response, payload } = await claim(accessToken);

  // This hits whatever server the scanned QR points to, not our own
  // backend, so it never goes through baseQueryWithReauth's automatic
  // refresh — an expired access token here used to fail immediately
  // instead of refreshing and retrying like every other authenticated call.
  let didRefresh = false;
  if (!response.ok && isExpiredTokenResponse(response.status, payload)) {
    logs.info('[qr-scanner] claim rejected token, refreshing', {
      status: response.status,
      code: payload?.code,
      claimHost: apiBaseUrl,
    });
    const refreshed = await refreshAccessTokenDirect();
    if (refreshed) {
      didRefresh = true;
      accessToken = refreshed;
      ({ response, payload } = await claim(accessToken));
    }
  }

  if (!response.ok || !payload?.ok) {
    logs.error('[qr-scanner] tablet pairing claim failed', {
      status: response.status,
      code: payload?.code,
      error: payload?.error || payload?.message,
      claimHost: apiBaseUrl,
      signedInHost: API_BASE_URL,
      isForeignHost,
      didRefresh,
    });

    // A brand-new access token being rejected by a host we are not signed in
    // to is a environment mismatch, not an expiry: the token was signed with
    // the signed-in backend's JWT_ACCESS_SECRET and this host verifies with a
    // different one. Refreshing can never fix that, so say so plainly rather
    // than echoing the remote host's misleading "Invalid/Expired token".
    if (didRefresh && isForeignHost && isExpiredTokenResponse(response.status, payload)) {
      throw {
        data: {
          error:
            `This device is paired to a different Dvaari backend (${apiBaseUrl}), ` +
            `but you are signed in to ${API_BASE_URL}. Sign in to the same environment as the device, or re-provision the device against this one.`,
        },
      };
    }

    throw {
      data: {
        error:
          payload?.error ||
          payload?.message ||
          `Could not link the device using ${apiBaseUrl}.`,
      },
    };
  }

  return payload;
}

export default function QrScannerScreen({ navigation, route }: Props) {
  const styles = useStyles();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const scale = useUiScale(CANVAS_W);
  const s = (n: number) => n * scale;
  // Figma's viewfinder frame (node 360:6441, "Qr Code of Box") is 280x262 —
  // not square. Same responsive envelope as before (0.72 of the available
  // dimension, capped smaller in landscape) applied to the width, with the
  // height derived from Figma's actual 262/280 ratio instead of forcing a
  // square.
  const frameW = Math.min((isLandscape ? height : width) * 0.72, isLandscape ? 248 : 284);
  const frameH = frameW * (262 / 280);
  const { type = 'device', from = 'setup' } = route.params || {};

  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const dispatch = useAppDispatch();

  const [state, setState] = useState<
    'scanning' | 'processing' | 'success' | 'error'
  >('scanning');
  const [scanned, setScanned] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  // DeviceSetup already gates navigation here behind a granted camera
  // permission, but that's not the only way this screen can be reached in
  // a denied state (permission revoked from OS settings while away, etc.) —
  // this tracks whether the request below has resolved yet, so a genuine
  // denial shows an explanatory screen instead of spinning forever.
  const [permissionChecked, setPermissionChecked] = useState(false);

  const [linkDevice] = useLinkDeviceMutation();
  const [claimDevicePairing] = useClaimDevicePairingMutation();

  useEffect(() => {
    requestPermission().finally(() => setPermissionChecked(true));
  }, [requestPermission]);

  const handleNavigation = () => {
    if (from === 'setup') {
      if (type === 'device') {
        // Not everyone who links a Dvaari device also owns the separate
        // Dvaari Box accessory — ask first (Figma node 607:2568) instead of
        // forcing everyone through box-linking regardless.
        navigation.reset({
          index: 0,
          routes: [{ name: 'AskDvaariBox' }],
        });
        return;
      }

      if (type === 'box') {
        // Permissions are already requested upfront (RequestPermissions,
        // before DeviceSetup even started), so once the box links there's
        // nothing left to gate on — straight to Home.
        navigation.reset({
          index: 0,
          routes: [{ name: 'MainTabs' }],
        });
      }
    }

    if (from === 'settings') {
      if (navigation.canGoBack()) {
        navigation.goBack();
      }
      setTimeout(() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
        }
      }, 0);
    }
  };

  const resetScanner = () => {
    setScanned(false);
    setState('scanning');
    setErrorMessage('');
  };

  const onQrDetected = async (value: string) => {
    if (scanned) return;

    setScanned(true);
    setState('processing');
    setErrorMessage('');

    try {
      logs.info('[qr-scanner] QR processing started');
      const qrPayload = parseQrPayload(value);
      logs.info('[qr-scanner] QR payload parsed', {
        type,
        qrType: qrPayload.type,
        // Which host the claim will target: the one baked into the QR when
        // present, otherwise our own configured backend.
        apiBaseUrl: qrPayload.apiBaseUrl || '(none — using API_BASE_URL)',
        signedInHost: API_BASE_URL,
      });

      if (type === 'device') {
        if (qrPayload.apiBaseUrl) {
          await claimTabletPairingDirect(qrPayload.qrToken, qrPayload.apiBaseUrl);
        } else {
          await claimDevicePairing({ qrToken: qrPayload.qrToken }).unwrap();
        }
      } else {
        if (isTabletPairingQr(qrPayload)) {
          throw {
            data: {
              error: 'This QR belongs to a Dvaari device. Please scan a Dvaari box QR code.',
            },
          };
        }

        await linkDevice({ qrToken: qrPayload.qrToken }).unwrap();
      }

      dispatch(authApi.util.invalidateTags(['Devices']));
      setState('success');
      logs.info('[qr-scanner] QR linked successfully', { type, from });
      celebrateAndNavigate(handleNavigation);
    } catch (error) {
      const message = getApiErrorMessage(error);
      logs.error('[qr-scanner] QR linking failed', { type, from, message });
      setErrorMessage(message);

      setState('error');
      setScanned(false);
    }
  };

  const handleUploadQr = async () => {
    if (scanned) return;

    try {
      logs.info('[qr-scanner] upload QR picker opened');
      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        includeBase64: false,
      });

      if (result.didCancel) return;

      if (result.errorCode) {
        logs.error('[qr-scanner] gallery picker failed', result.errorMessage || result.errorCode);
        setErrorMessage(result.errorMessage || 'Could not open gallery.');
        setState('error');
        return;
      }

      const uri = result.assets?.[0]?.uri;
      if (!uri) return;

      setState('processing');
      const { values } = await RNQRGenerator.detect({ uri });

      if (!values?.length) {
        logs.info('[qr-scanner] no QR code found in uploaded image');
        setErrorMessage('No QR code found in the selected image.');
        setState('error');
        return;
      }

      await onQrDetected(values[0]);
    } catch (error) {
      logs.error('[qr-scanner] upload QR failed', error);
      setErrorMessage('Could not read QR code from the selected image.');
      setState('error');
    }
  };

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: codes => {
      if (!codes.length || scanned) return;

      const value = codes[0].value;
      if (value) {
        onQrDetected(value);
      }
    },
  });

  // Still waiting on the permission request (or, once granted, on the
  // camera device itself to enumerate) — brief, not a dead end.
  if (!permissionChecked || (hasPermission && !device)) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  // Permission request resolved and came back denied — explain why the
  // screen can't do anything yet and offer a real way forward, instead of
  // spinning forever with no explanation.
  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={[styles.container, styles.permissionWrap]}>
          <Text style={styles.permissionTitle}>Camera access needed</Text>
          <Text style={styles.permissionSubtitle}>
            Dvaari needs camera access to scan the QR code and link your device. Enable it in
            Settings to continue.
          </Text>
          <Pressable
            style={styles.permissionPrimaryBtn}
            onPress={() => Linking.openSettings()}
          >
            <Text style={styles.permissionPrimaryBtnText}>Open Settings</Text>
          </Pressable>
          <Pressable style={styles.permissionSecondaryBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.permissionSecondaryBtnText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Unreachable in practice — the two guards above already require
  // hasPermission && device by this point — but narrows the type for
  // Camera's device prop below instead of a non-null assertion.
  if (!device) {
    return null;
  }

  const title =
    state === 'success'
      ? `${type === 'device' ? 'Device' : 'Dvaari Box'} Linked!`
      : state === 'error'
        ? 'Linking failed'
        : 'Scan QR Code';

  const subtitle =
    state === 'success'
      ? 'Successfully connected to your device'
      : state === 'error'
        ? errorMessage
        : `Point your camera at the QR code on your Dvaari ${type}`;

  const onDemoTap = () => {
    if (!DEMO_ONBOARDING_WALKTHROUGH || state !== 'scanning') return;
    logs.info('[qr-scanner] demo tap standing in for a successful scan', { type });
    setScanned(true);
    setState('success');
    celebrateAndNavigate(handleNavigation);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.container}>
        <Camera
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={state === 'scanning'}
          torch={torchOn ? 'on' : 'off'}
          codeScanner={codeScanner}
        />

        {/* Figma's y=72 already includes its 44px status-bar mockup — the
            SafeAreaView above already insets past the real status bar, so
            only the leftover (72-44=28) belongs here, same convention as
            every other screen's HEADER_TOP. Using the raw 72 double-counts
            the status bar and pushes this down too far. */}
        <View style={[styles.topBar, { top: s(28), left: s(19), right: s(19) }]}>
          <Pressable
            style={[styles.topAction, { width: s(26), height: s(26), borderRadius: s(13) }]}
            onPress={() => navigation.goBack()}
          >
            <HeaderBackIcon size={s(16)} />
          </Pressable>
        </View>

        {DEMO_ONBOARDING_WALKTHROUGH && state === 'scanning' ? (
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Simulate a successful scan"
            onPress={onDemoTap}
          />
        ) : null}

        <View style={styles.centerArea} pointerEvents="none">
          {state === 'success' ? (
            <View style={[styles.scanFrame, { width: frameW, height: frameW }]}>
              <ScanedSvg width={frameW} height={frameW} />
            </View>
          ) : (
            // Four independently positioned corner brackets + center dot,
            // matching Figma's literal structure (nodes 360:6450-360:6455)
            // exactly instead of stretching the square scan-area.svg asset
            // into a non-square box.
            <View style={[styles.scanFrame, { width: frameW, height: frameH }]}>
              <View
                style={[
                  styles.cornerTL,
                  { width: s(40), height: s(40), borderLeftWidth: s(4), borderTopWidth: s(4), borderTopLeftRadius: s(8) },
                ]}
              />
              <View
                style={[
                  styles.cornerTR,
                  { width: s(40), height: s(40), borderRightWidth: s(4), borderTopWidth: s(4), borderTopRightRadius: s(8) },
                ]}
              />
              <View
                style={[
                  styles.cornerBL,
                  { width: s(40), height: s(40), borderLeftWidth: s(4), borderBottomWidth: s(4), borderBottomLeftRadius: s(8) },
                ]}
              />
              <View
                style={[
                  styles.cornerBR,
                  { width: s(40), height: s(40), borderRightWidth: s(4), borderBottomWidth: s(4), borderBottomRightRadius: s(8) },
                ]}
              />
              <View
                style={[
                  styles.centerDot,
                  { width: s(8), height: s(8), borderRadius: s(4), left: s(136), marginTop: -s(4) },
                ]}
              />
            </View>
          )}

          {state === 'processing' && (
            <View style={styles.processingOverlay}>
              <ActivityIndicator size="large" color="#fff" />
            </View>
          )}
        </View>

        <View style={[styles.bottom, { paddingHorizontal: s(SCREEN_PADDING_H) }, isLandscape && styles.bottomLandscape]}>
          <Text
            style={[
              state === 'success' ? styles.successTitle : styles.title,
              { fontSize: state === 'success' ? s(20) : s(18) },
            ]}
          >
            {title}
          </Text>

          <Text
            style={[
              state === 'success' ? styles.successSubtitle : styles.subtitle,
              { fontSize: s(14), marginTop: s(8) },
            ]}
          >
            {subtitle}
          </Text>

          {state === 'scanning' && (
            <View style={[styles.actionsRow, { marginTop: s(21), gap: s(10) }]}>
              <Pressable
                style={[
                  styles.flashBtn,
                  { height: s(32), minWidth: s(117), borderRadius: s(46), paddingHorizontal: s(18), gap: s(8) },
                  torchOn && styles.flashBtnActive,
                ]}
                onPress={() => {
                  if (device?.hasTorch) {
                    setTorchOn(current => !current);
                  }
                }}
              >
                <FlashSvg width={s(16)} height={s(16)} />
                <Text style={[styles.flashText, { fontSize: s(14) }]}>
                  {torchOn ? 'Flash on' : 'Tap for flash'}
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.flashBtn,
                  { height: s(32), minWidth: s(117), borderRadius: s(46), paddingHorizontal: s(18), gap: s(8) },
                ]}
                onPress={handleUploadQr}
              >
                <GallerySvg width={s(16)} height={s(16)} />
                <Text style={[styles.flashText, { fontSize: s(14) }]}>Upload QR</Text>
              </Pressable>
            </View>
          )}

          {state === 'error' && (
            <Pressable style={styles.retryActionBtn} onPress={resetScanner}>
              <Text style={styles.retryActionText}>Try again</Text>
            </Pressable>
          )}

          <View style={[styles.tipBox, { marginTop: s(24), borderRadius: s(16), paddingHorizontal: s(17), paddingVertical: s(17) }]}>
            <Text style={[styles.tipText, { fontSize: s(13) }]}>
              💡 Make sure the QR code is clearly visible and well-lit
            </Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

function useStyles() {
  const scale = useUiScale();
  return useMemo(() => createStyles(scale), [scale]);
}

function createStyles(scale: number) {
  const s = (n: number) => n * scale;

  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: '#000',
    },

    container: {
      flex: 1,
      backgroundColor: '#040509',
    },

    loader: {
      flex: 1,
      backgroundColor: '#040509',
      justifyContent: 'center',
      alignItems: 'center',
    },

    permissionWrap: {
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: s(32),
    },

    permissionTitle: {
      color: '#fff',
      fontSize: s(18),
      textAlign: 'center',
      fontFamily: 'Satoshi-Medium',
    },

    permissionSubtitle: {
      marginTop: s(8),
      color: 'rgba(255, 255, 255, 0.8)',
      fontSize: s(14),
      lineHeight: s(20),
      textAlign: 'center',
      fontFamily: 'Satoshi-Regular',
    },

    permissionPrimaryBtn: {
      marginTop: s(24),
      backgroundColor: '#2563EB',
      paddingHorizontal: s(24),
      paddingVertical: s(12),
      borderRadius: 999,
    },

    permissionPrimaryBtnText: {
      color: '#fff',
      fontWeight: '700',
      textAlign: 'center',
    },

    permissionSecondaryBtn: {
      marginTop: s(16),
      paddingHorizontal: s(24),
      paddingVertical: s(8),
    },

    permissionSecondaryBtnText: {
      color: 'rgba(255, 255, 255, 0.7)',
      fontFamily: 'Satoshi-Regular',
      textAlign: 'center',
    },

    topBar: {
      position: 'absolute',
      top: s(14),
      left: s(18),
      right: s(18),
      flexDirection: 'row',
      zIndex: 10,
    },

    topAction: {
      width: s(38),
      height: s(38),
      borderRadius: s(19),
      alignItems: 'center',
      justifyContent: 'center',
      // Figma's "Ellipse 5" back-button convention used everywhere else in the
      // dark theme (Onboarding, Otp, PersonalDetails, ...) — a translucent
      // white disc, not the darker navy tint this used to have.
      backgroundColor: 'rgba(255, 255, 255, 0.15)',
      borderWidth: 0.23,
      borderColor: 'rgba(255, 255, 255, 0.15)',
    },
    centerArea: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingTop: s(56),
    },

    scanFrame: {
      position: 'relative',
      justifyContent: 'center',
      alignItems: 'center',
    },

    cornerTL: {
      position: 'absolute',
      left: 0,
      top: 0,
      borderColor: '#fff',
    },

    cornerTR: {
      position: 'absolute',
      right: 0,
      top: 0,
      borderColor: '#fff',
    },

    cornerBL: {
      position: 'absolute',
      left: 0,
      bottom: 0,
      borderColor: '#fff',
    },

    cornerBR: {
      position: 'absolute',
      right: 0,
      bottom: 0,
      borderColor: '#fff',
    },

    centerDot: {
      position: 'absolute',
      top: '50%',
      backgroundColor: '#fff',
      opacity: 0.95,
    },

    processingOverlay: {
      position: 'absolute',
      width: s(118),
      height: s(118),
      borderRadius: s(59),
      backgroundColor: 'rgba(15, 23, 42, 0.72)',
      justifyContent: 'center',
      alignItems: 'center',
    },

    bottom: {
      paddingBottom: s(34),
    },

    bottomLandscape: {
      paddingBottom: s(18),
    },

    title: {
      color: '#fff',
      textAlign: 'center',
      fontFamily: 'Satoshi-Medium',
    },

    subtitle: {
      paddingHorizontal: s(36),
      color: 'rgba(255, 255, 255, 0.8)',
      textAlign: 'center',
      lineHeight: s(20),
      fontFamily: 'Satoshi-Regular',
    },

    actionsRow: {
      flexDirection: 'row',
      alignSelf: 'center',
      alignItems: 'center',
    },

    flashBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      borderWidth: 0.23,
      borderColor: 'rgba(255, 255, 255, 0.3)',
    },

    flashText: {
      color: '#fff',
      textAlign: 'center',
      fontFamily: 'Satoshi-Regular',
    },

    flashBtnActive: {
      backgroundColor: 'rgba(255, 255, 255, 0.28)',
    },

    retryActionBtn: {
      alignSelf: 'center',
      marginTop: s(16),
      backgroundColor: '#2563EB',
      paddingHorizontal: s(20),
      paddingVertical: s(12),
      borderRadius: 999,
    },

    retryActionText: {
      color: '#fff',
      fontWeight: '700',
      textAlign: 'center',
    },

    tipBox: {
      marginHorizontal: s(14),
      borderWidth: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      borderColor: 'rgba(255, 255, 255, 0.2)',
    },

    tipText: {
      color: 'rgba(255, 255, 255, 0.9)',
      fontFamily: 'Satoshi-Regular',
      textAlign: 'center',
      lineHeight: s(20),
    },

    successTitle: {
      color: '#22C55E',
      textAlign: 'center',
      fontFamily: 'Satoshi-Medium',
    },

    successSubtitle: {
      color: 'rgba(255, 255, 255, 0.8)',
      textAlign: 'center',
      fontFamily: 'Satoshi-Regular',
      marginTop: s(8),
    },
  });
}
