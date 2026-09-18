import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RTCView } from 'react-native-webrtc';

import type { RootStackParamList } from '../../../navigation/RootNavigator';
import BlueHeader from '../../../components/layout/BlueHeader';
import { useTabletLiveFeed } from '../../liveFeed/useTabletLiveFeed';
import CallEndSvg from '../../../assets/icons/live-feed/call-end-02.svg';
import MicOffSvg from '../../../assets/icons/live-feed/mic-02.svg';
import MicOnSvg from '../../../assets/icons/live-feed/mic-on-02.svg';
import SpeakerOffSvg from '../../../assets/icons/live-feed/fluent_speaker-off-24-regular.svg';
import SpeakerOnSvg from '../../../assets/icons/live-feed/speaker-on-24.svg';
import { useEndTabletCallMutation } from '../../../services/api/tabletCallsApi';

type Props = NativeStackScreenProps<RootStackParamList, 'LiveFeed'>;

export default function LiveFeed({ navigation, route }: Props) {
  const {
    viewerState,
    errorMessage,
    remoteStreamUrl,
    streamRenderKey,
    isMicrophoneEnabled,
    isSpeakerEnabled,
    toggleMicrophone,
    toggleSpeaker,
    retry,
  } = useTabletLiveFeed();
  const [endTabletCall] = useEndTabletCallMutation();
  const [clock, setClock] = useState(() => new Date());
  const linkedCallId = route.params?.linkedCallId;
  const screenTitle = route.params?.title || 'Live Feed';

  const isLive = !!remoteStreamUrl;
  const isBusy =
    viewerState === 'starting' ||
    viewerState === 'connecting' ||
    viewerState === 'reconnecting';

  useEffect(() => {
    const timer = setInterval(() => {
      setClock(new Date());
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  const closeLinkedCall = async (reason = 'resident_live_feed_closed') => {
    if (!linkedCallId) {
      return;
    }

    try {
      await endTabletCall({ callId: linkedCallId, reason }).unwrap();
    } catch {
      // Best-effort cleanup for the original incoming call session.
    }
  };

  const handleExit = async () => {
    await closeLinkedCall();
    navigation.goBack();
  };

  const statusTitle =
    viewerState === 'offline'
      ? 'Device Offline'
      : viewerState === 'unavailable'
        ? 'Live Feed Unavailable'
        : viewerState === 'error'
          ? 'Connection Error'
          : isLive
            ? 'Front Camera Live'
            : 'Connecting Live Feed';

  const subtitle =
    errorMessage ||
    (isLive
      ? 'Streaming from your linked tablet front camera.'
      : 'Preparing secure live stream from your linked tablet.');

  const timeLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }).format(clock),
    [clock],
  );

  return (
    <SafeAreaView style={styles.safe}>
      <BlueHeader
        title={screenTitle}
        compact
        onBackPress={() => {
          void handleExit();
        }}
      />

      <View style={styles.liveContainer}>
        <View style={styles.videoShell}>
          {isLive ? (
            <RTCView
              key={`${streamRenderKey}:${remoteStreamUrl}`}
              streamURL={remoteStreamUrl}
              style={styles.video}
              objectFit="cover"
            />
          ) : (
            <View style={styles.videoPlaceholder}>
              {isBusy ? (
                <ActivityIndicator color="#FFFFFF" size="large" />
              ) : null}
              <Text style={styles.placeholderTitle}>{statusTitle}</Text>
              <Text style={styles.placeholderSubtitle}>{subtitle}</Text>
              {!isBusy ? (
                <Pressable onPress={retry} style={styles.inlineRetryButton}>
                  <Text style={styles.inlineRetryText}>Retry Live Feed</Text>
                </Pressable>
              ) : null}
            </View>
          )}

          {viewerState === 'reconnecting' ? (
            <View style={styles.overlayNotice}>
              <ActivityIndicator color="#FFFFFF" />
              <Text style={styles.overlayText}>Reconnecting stream...</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.timeText}>{timeLabel}</Text>

        <Pressable
          onPress={() => {
            void handleExit();
          }}
          style={styles.endButton}>
          <CallEndSvg width={20} height={20} />
          <Text style={styles.endButtonText}>End Live</Text>
        </Pressable>

        <View style={styles.controlRow}>
          <Pressable
            onPress={toggleMicrophone}
            style={[
              styles.controlButton,
              isMicrophoneEnabled
                ? styles.controlButtonActive
                : styles.controlButtonInactive,
            ]}>
            {isMicrophoneEnabled ? (
              <MicOnSvg width={24} height={24} />
            ) : (
              <MicOffSvg width={24} height={24} />
            )}
          </Pressable>
          <Pressable
            onPress={toggleSpeaker}
            style={[
              styles.controlButton,
              isSpeakerEnabled
                ? styles.controlButtonActive
                : styles.controlButtonInactive,
            ]}>
            {isSpeakerEnabled ? (
              <SpeakerOnSvg width={24} height={24} />
            ) : (
              <SpeakerOffSvg width={24} height={24} />
            )}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#000',
  },
  liveContainer: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    paddingTop: 0,
    paddingHorizontal: 0,
  },
  videoShell: {
    width: '100%',
    aspectRatio: 1.08,
    overflow: 'hidden',
    backgroundColor: '#0C0C0C',
  },
  video: {
    flex: 1,
    backgroundColor: '#000000',
  },
  videoPlaceholder: {
    flex: 1,
    backgroundColor: '#050505',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  placeholderTitle: {
    marginTop: 18,
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  placeholderSubtitle: {
    marginTop: 8,
    color: '#B8B8B8',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  inlineRetryButton: {
    marginTop: 18,
    borderRadius: 12,
    backgroundColor: '#1F56D9',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  inlineRetryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  timeText: {
    marginTop: 12,
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  endButton: {
    marginTop: 26,
    minWidth: 156,
    borderRadius: 12,
    backgroundColor: '#242424',
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  endButtonText: {
    marginLeft: 10,
    color: '#EAEAEA',
    fontSize: 16,
    fontWeight: '600',
  },
  controlRow: {
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 18,
  },
  controlButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlButtonActive: {
    backgroundColor: '#1C1C1C',
  },
  controlButtonInactive: {
    backgroundColor: '#292929',
  },
  overlayNotice: {
    position: 'absolute',
    bottom: 150,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  overlayText: {
    marginLeft: 10,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
});
