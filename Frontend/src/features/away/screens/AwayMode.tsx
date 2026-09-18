import React, { useEffect, useMemo, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Switch,
  useWindowDimensions,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../../navigation/RootNavigator';
import {
  useGetAwayModeOverviewQuery,
  useToggleAwayModeMutation,
} from '../../../services/api/awayModeApi';
import CardSvg from '../../../assets/icons/away-mode/card.svg';
import BackupSvg from '../../../assets/icons/away-mode/backup-user.svg';
import LocationSvg from '../../../assets/icons/away-mode/location.svg';
import RightArrowSvg from '../../../assets/icons/away-mode/right-arrow.svg';
import BackSvg from '../../../assets/icons/away-mode/back-white.svg';

type Props = NativeStackScreenProps<RootStackParamList, 'AwayMode'>;

type StepItem = {
  id: string;
  title: string;
};

export default function AwayMode({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const isCompact = width < 360;
  const { data: overviewResp } = useGetAwayModeOverviewQuery();
  const [toggleAwayMode, { isLoading: isTogglingAwayMode }] =
    useToggleAwayModeMutation();
  const [isAwayEnabled, setIsAwayEnabled] = useState(false);

  useEffect(() => {
    if (typeof overviewResp?.data?.enabled === 'boolean') {
      setIsAwayEnabled(overviewResp.data.enabled);
    }
  }, [overviewResp]);

  const steps = useMemo<StepItem[]>(
    () => [
      {
        id: '1',
        title: 'Delivery comes – You get instant push notification',
      },
      {
        id: '2',
        title: 'Approve in 60 sec – Second alert expires at 60 sec',
      },
      {
        id: '3',
        title: 'Still no response in 30 secs – Second alert sent',
      },
      {
        id: '4',
        title:
          'Backup uses code - You get final approval request with live video',
      },
    ],
    [],
  );

  const onGenerateTemporaryCode = () => {
    navigation.navigate('Backup');
  };

  const onSchedulePress = () => {
    navigation.navigate('TimeSchedule');
  };

  const onBackupPersonPress = () => {
    // later
  };

  const onSafeDropPress = () => {
    // later
  };

  const handleToggleAwayMode = async (value: boolean) => {
    setIsAwayEnabled(value);

    try {
      await toggleAwayMode({ enabled: value }).unwrap();
    } catch {
      setIsAwayEnabled(!value);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          isCompact && styles.contentCompact,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Top orange header */}
        <View style={styles.topSection}>
          <View style={styles.topHeaderRow}>
            <Pressable
              onPress={() => navigation.goBack()}
              style={styles.backBtn}
            >
                                                  <BackSvg width={16} height={16} />
             
            </Pressable>

            <Text style={styles.topTitle}>Away Mode</Text>

            <View style={styles.backBtn} />
          </View>

          <View style={styles.awayCard}>
            <View style={styles.awayCardLeft}>
              <Text style={styles.awayCardTitle}>Currently Away</Text>
              <Text style={styles.awayCardSub}>Active until 6:00 PM</Text>
            </View>

            <Switch
              value={isAwayEnabled}
              onValueChange={handleToggleAwayMode}
              disabled={isTogglingAwayMode}
              trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
              thumbColor={isAwayEnabled ? '#2563EB' : '#FFFFFF'}
              ios_backgroundColor="#D1D5DB"
            />
          </View>
        </View>

        {/* Body */}
        <View style={styles.body}>
          <Pressable
            style={styles.primaryBtn}
            onPress={onGenerateTemporaryCode}
          >
            <Text style={styles.primaryBtnText}>Generate Temporary Code</Text>
          </Pressable>

          <Text style={styles.sectionTitle}>Away Mode Setting</Text>

          {/* Time Schedule */}
          <Pressable style={styles.card} onPress={onSchedulePress}>
            <View style={styles.cardRow}>
              <View style={styles.leftInfo}>
                <View style={[styles.iconBox, styles.iconBoxBlue]}>
                  <CardSvg width={24} height={24} />
                </View>

                <View style={styles.textWrap}>
                  <Text style={styles.cardLabel}>Time Schedule</Text>
                  <Text style={styles.cardValue}>8:30 AM - 6:00 PM</Text>
                </View>
              </View>
              <RightArrowSvg width={16} height={16} />

            </View>
          </Pressable>

          {/* Backup Person */}
          <Pressable style={styles.card} onPress={onBackupPersonPress}>
            <View style={styles.cardRow}>
              <View style={styles.leftInfo}>
                <View style={[styles.iconBox, styles.iconBoxGreen]}>
                                <BackupSvg width={24} height={24} />

                </View>

                <View style={styles.textWrap}>
                  <Text style={styles.cardLabel}>Backup Person</Text>
                  <Text style={styles.cardValue}>Mrs. Sharma</Text>
                  <Text style={styles.cardSub}>Auto-generated</Text>
                </View>
              </View>

              <RightArrowSvg width={16} height={16} />
            </View>
          </Pressable>

          {/* Safe Drop Zone */}
          <Pressable style={styles.card} onPress={onSafeDropPress}>
            <View style={styles.cardRow}>
              <View style={styles.leftInfo}>
                <View style={[styles.iconBox, styles.iconBoxPurple]}>
                  <LocationSvg width={24} height={24} />
                </View>

                <View style={styles.textWrap}>
                  <Text style={styles.cardLabel}>Safe Drop Zone</Text>
                  <Text style={styles.cardValue}>For low-value Items</Text>
                </View>
              </View>

                           <RightArrowSvg width={16} height={16} />

            </View>

            <View style={styles.divider} />

            <Text style={styles.safeDropLabel}>
              Auto-accept packages under:
            </Text>
            <Text style={styles.safeDropAmount}>₹2000</Text>
            <Text style={styles.safeDropSub}>
              Package will be left at designated safe drop location with video
              recording
            </Text>
          </Pressable>

          {/* Video Recording */}
          {/* <Pressable style={styles.card} onPress={onRecordingPress}>
            <View style={styles.cardRow}>
              <View style={styles.leftInfo}>
                <View style={[styles.iconBox, styles.iconBoxIndigo]}>
                  <Image
                    source={require('../../../assets/icons/common/video-recording.png')}
                    style={styles.cardIcon}
                    resizeMode="contain"
                  />
                </View>

                <View style={styles.textWrap}>
                  <Text style={styles.cardLabel}>Video Recording</Text>
                  <Text style={styles.cardValue}>Active</Text>
                </View>
              </View>

              <Text style={styles.recordingStatus}>recording •</Text>
            </View>
          </Pressable> */}

          {/* How it works */}
          <View style={styles.howItWorksCard}>
            <Text style={styles.howItWorksTitle}>How It Works</Text>

            <View style={styles.stepsWrap}>
              {steps.map((step, index) => (
                <View key={step.id} style={styles.stepRow}>
                  <View style={styles.stepCircle}>
                    <Text style={styles.stepNumber}>{index + 1}</Text>
                  </View>

                  <Text style={styles.stepText}>{step.title}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={{ height: 18 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },

  content: {
    flexGrow: 1,
  },

  contentCompact: {},

  topSection: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 18,
    paddingTop: 48,
    paddingBottom: 22,
  },

  topHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },

  backBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },

  backIcon: {
    width: 22,
    height: 22,
  },

  topTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },

  awayCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  awayCardLeft: {
    flex: 1,
  },

  awayCardTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '800',
  },

  awayCardSub: {
    marginTop: 6,
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '500',
  },

  body: {
    paddingHorizontal: 18,
    paddingTop: 18,
  },

  primaryBtn: {
    height: 54,
    borderRadius: 12,
    backgroundColor: '#2362EB',
    alignItems: 'center',
    justifyContent: 'center',
  },

  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },

  sectionTitle: {
    marginTop: 26,
    marginBottom: 14,
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    marginBottom: 14,
  },

  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },

  leftInfo: {
    flexDirection: 'row',
    gap: 12,
    flex: 1,
  },

  iconBox: {
    width: 54,
    height: 54,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  iconBoxBlue: {
    backgroundColor: '#EEF2FF',
  },

  iconBoxGreen: {
    backgroundColor: '#ECFDF3',
  },

  iconBoxPurple: {
    backgroundColor: '#F3E8FF',
  },

  iconBoxIndigo: {
    backgroundColor: '#EEF2FF',
  },

  cardIcon: {
    width: 48,
    height: 48,
  },

  textWrap: {
    flex: 1,
    justifyContent: 'center',
  },

  cardLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4B5563',
  },

  cardValue: {
    marginTop: 4,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
    color: '#111827',
  },

  cardSub: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },

  chevron: {
    width: 18,
    height: 18,
    marginTop: 4,
  },

  divider: {
    marginTop: 16,
    marginBottom: 16,
    height: 1,
    backgroundColor: '#E5E7EB',
  },

  safeDropLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4B5563',
  },

  safeDropAmount: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: '900',
    color: '#2362EB',
  },

  safeDropSub: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '500',
    color: '#4B5563',
  },

  recordingStatus: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
  },

  howItWorksCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    marginTop: 2,
  },

  howItWorksTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
  },

  stepsWrap: {
    marginTop: 14,
    gap: 16,
  },

  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },

  stepCircle: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: '#2362EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },

  stepNumber: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  stepText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 24,
    fontWeight: '500',
    color: '#374151',
  },
});
