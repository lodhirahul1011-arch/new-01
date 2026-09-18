import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import type { RootStackParamList } from '../../../navigation/RootNavigator';
import {
  cancelActiveCallNotification,
  cancelIncomingCallNotification,
  displayActiveCallNotification,
} from '../../../services/notifications/pushNotifications';
import {
  clearMobileCallActive,
  markMobileCallActive,
} from '../../../services/calls/mobileCallPresence';
import { useTabletAudioCall } from '../hooks/useTabletAudioCall';
import { logs } from '../../../services/logs';

type Props = NativeStackScreenProps<RootStackParamList, 'ActiveCall'>;

const CALLER_LABEL = 'Visitor at Door';

function DoodleBackground() {
  const icons = [
    { x: 26, y: 92, rotate: -8 },
    { x: 168, y: 70, rotate: 14 },
    { x: 310, y: 118, rotate: -16 },
    { x: 78, y: 248, rotate: 18 },
    { x: 238, y: 282, rotate: -10 },
    { x: 34, y: 430, rotate: 9 },
    { x: 194, y: 458, rotate: -18 },
    { x: 330, y: 398, rotate: 12 },
    { x: 112, y: 620, rotate: -14 },
    { x: 286, y: 650, rotate: 16 },
    { x: 58, y: 760, rotate: 10 },
    { x: 220, y: 810, rotate: -8 },
  ];

  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 390 860" preserveAspectRatio="xMidYMid slice">
      <Rect width="390" height="860" fill="#0B1518" />
      {icons.map((item, index) => (
        <G
          key={`${item.x}-${item.y}-${index}`}
          opacity={0.105}
          transform={`translate(${item.x} ${item.y}) rotate(${item.rotate})`}
          stroke="#D8E2E5"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        >
          <Circle cx="0" cy="0" r="22" />
          <Path d="M-10 -2h20M-4 -10l10 10-10 10" />
          <Path d="M34 -18l14 14-14 14-14-14z" />
          <Path d="M-42 26c12-18 31-18 42 0M-32 18c7-8 17-8 24 0" />
          <Path d="M38 38h28v18H38zM44 32v6M60 32v6" />
          <Path d="M-54 -38c10-14 26-14 36 0M-49 -45l13 22 13-22" />
        </G>
      ))}
    </Svg>
  );
}

function LetterAvatar() {
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarLetter}>V</Text>
    </View>
  );
}

function SpeakerIcon({ active }: { active: boolean }) {
  const stroke = active ? '#10181B' : '#FFFFFF';
  return (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
      <Path d="M4 14H8L13 18V6L8 10H4V14Z" stroke={stroke} strokeWidth="2.2" strokeLinejoin="round" />
      <Path d="M16 9C17.2 9.8 18 11.15 18 12.5C18 13.85 17.2 15.2 16 16" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
      <Path d="M18.5 6.5C20.5 8 21.75 10.1 21.75 12.5C21.75 14.9 20.5 17 18.5 18.5" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
    </Svg>
  );
}

function MuteIcon({ muted }: { muted: boolean }) {
  const stroke = muted ? '#D90B43' : '#FFFFFF';
  return (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
      <Rect x="9" y="3" width="6" height="11" rx="3" stroke={stroke} strokeWidth="2.2" />
      <Path d="M6 11.5C6 14.8137 8.68629 17.5 12 17.5C15.3137 17.5 18 14.8137 18 11.5" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
      <Path d="M12 17.5V21" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
      <Path d="M9 21H15" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
      {muted ? <Path d="M5 20L20 5" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" /> : null}
    </Svg>
  );
}

function HangupIcon() {
  return (
    <Svg width={36} height={36} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5.2 15.15C6.86 13.95 9.32 13.25 12 13.25C14.68 13.25 17.14 13.95 18.8 15.15L17.42 18.45C16.02 17.62 14.18 17.15 12 17.15C9.82 17.15 7.98 17.62 6.58 18.45L5.2 15.15Z"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');

  return `${mins}:${secs}`;
}

export default function ActiveCall({ navigation, route }: Props) {
  const { callId, callerPhone, callType } = route.params;
  const {
    callState,
    errorMessage,
    isMicrophoneEnabled,
    isSpeakerEnabled,
    toggleMicrophone,
    toggleSpeaker,
    endCall,
  } = useTabletAudioCall(callId);
  const [ending, setEnding] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const connectedAtRef = useRef<number | null>(null);

  const statusText = useMemo(() => {
    if (callState === 'connected') {
      return formatDuration(elapsedSeconds);
    }
    if (callState === 'reconnecting') {
      return 'Reconnecting...';
    }
    if (callState === 'ended') {
      return 'Call ended';
    }
    if (callState === 'error') {
      return errorMessage || 'Unable to connect the call.';
    }
    return 'Connecting...';
  }, [callState, elapsedSeconds, errorMessage]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    markMobileCallActive(callId);
  }, [callId]);

  useEffect(() => {
    cancelIncomingCallNotification(callId).catch(() => undefined);
    displayActiveCallNotification({
      callId,
      callerName: CALLER_LABEL,
      callerPhone,
      callType,
    }).catch(() => undefined);

    return () => {
      cancelActiveCallNotification(callId).catch(() => undefined);
    };
  }, [callId, callType, callerPhone]);

  useEffect(() => {
    if (callState !== 'connected') {
      if (callState !== 'ended') {
        connectedAtRef.current = null;
        setElapsedSeconds(0);
      }
      return;
    }

    if (!connectedAtRef.current) {
      connectedAtRef.current = Date.now();
      setElapsedSeconds(0);
    }

    const interval = setInterval(() => {
      if (!connectedAtRef.current) {
        return;
      }
      setElapsedSeconds(Math.floor((Date.now() - connectedAtRef.current) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [callState]);

  useEffect(() => {
    if (callState !== 'ended') {
      return;
    }

    cancelIncomingCallNotification(callId).catch(() => undefined);
    cancelActiveCallNotification(callId).catch(() => undefined);
    clearMobileCallActive(callId).catch(() => undefined);

    const timeout = setTimeout(() => {
      cancelActiveCallNotification(callId).catch(() => undefined);
      navigation.replace('MainTabs');
    }, 700);

    return () => clearTimeout(timeout);
  }, [callId, callState, navigation]);

  const handleEndCall = async () => {
    if (ending) {
      return;
    }

    try {
      setEnding(true);
      logs.info('[AudioCall][Mobile] resident hangup button pressed', { callId });
      await endCall('resident_hangup_button');
    } catch (error) {
      logs.error('[AudioCall][Mobile] resident hangup failed', String(error));
    } finally {
      cancelActiveCallNotification(callId).catch(() => undefined);
      clearMobileCallActive(callId).catch(() => undefined);
      navigation.replace('MainTabs');
    }
  };

  const muted = !isMicrophoneEnabled;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0B1518" />
      <DoodleBackground />
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{CALLER_LABEL}</Text>
          <Text style={styles.status}>{statusText}</Text>
        </View>

        <View style={styles.avatarWrap}>
          <LetterAvatar />
        </View>

        <View style={styles.controlsBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Toggle speaker"
            onPress={toggleSpeaker}
            style={[styles.controlButton, isSpeakerEnabled && styles.controlButtonActive]}
          >
            <SpeakerIcon active={isSpeakerEnabled} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Toggle mute"
            onPress={toggleMicrophone}
            style={[styles.controlButton, muted && styles.controlButtonActive]}
          >
            <MuteIcon muted={muted} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Hang up"
            onPress={handleEndCall}
            style={[styles.controlButton, styles.hangupButton]}
          >
            {ending ? <ActivityIndicator color="#FFF" /> : <HangupIcon />}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B1518',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 74,
    paddingBottom: 32,
  },
  header: {
    alignItems: 'center',
    minHeight: 104,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
  },
  status: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.58)',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  avatarWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  avatar: {
    width: 216,
    height: 216,
    borderRadius: 108,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#073544',
  },
  avatarLetter: {
    color: '#55C7F4',
    fontSize: 92,
    fontWeight: '900',
  },
  controlsBar: {
    width: '100%',
    minHeight: 96,
    borderRadius: 20,
    backgroundColor: 'rgba(13, 23, 26, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingVertical: 14,
  },
  controlButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#172326',
  },
  controlButtonActive: {
    backgroundColor: '#FFFFFF',
  },
  hangupButton: {
    backgroundColor: '#F00646',
  },
});
