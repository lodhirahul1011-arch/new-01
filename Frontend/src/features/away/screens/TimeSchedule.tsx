import React, { useMemo, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../../navigation/RootNavigator';
import ClockSvg from '../../../assets/icons/away-mode/clock.svg';
import DropSvg from '../../../assets/icons/away-mode/drop-arrow.svg';
import UpArrowSvg from '../../../assets/icons/away-mode/up-arrow.svg';
import TickSvg from '../../../assets/icons/away-mode/tick-blue.svg';
import BackSvg from '../../../assets/icons/away-mode/back-white.svg';

type Props = NativeStackScreenProps<RootStackParamList, 'TimeSchedule'>;

type DayKey = 'M' | 'T1' | 'W' | 'T2' | 'F' | 'S1' | 'S2';
type RepeatType = 'weekdays' | 'weekend' | 'everyday';
type OpenPicker = 'start' | 'end' | null;

type Preset = {
  id: string;
  title: string;
  time: string;
  start: string;
  end: string;
};

const START_OPTIONS = [
  '07:00 AM',
  '07:30 AM',
  '08:00 AM',
  '08:30 AM',
  '09:00 AM',
  '09:30 AM',
  '10:00 AM',
  '10:30 AM',
  '11:00 AM',
  '11:30 AM',
  '12:00 PM',
];

const END_OPTIONS = [
  '12:00 PM',
  '12:30 PM',
  '01:00 PM',
  '01:30 PM',
  '02:00 PM',
  '02:30 PM',
  '03:00 PM',
  '03:30 PM',
  '04:00 PM',
  '04:30 PM',
  '05:00 PM',
  '05:30 PM',
  '06:00 PM',
  '06:30 PM',
  '07:00 PM',
  '07:30 PM',
  '08:00 PM',
  '08:30 PM',
  '09:00 PM',
];

const DAY_META: { key: DayKey; label: string; full: string }[] = [
  { key: 'M', label: 'M', full: 'Mon' },
  { key: 'T1', label: 'T', full: 'Tue' },
  { key: 'W', label: 'W', full: 'Wed' },
  { key: 'T2', label: 'T', full: 'Thu' },
  { key: 'F', label: 'F', full: 'Fri' },
  { key: 'S1', label: 'S', full: 'Sat' },
  { key: 'S2', label: 'S', full: 'Sun' },
];

export default function TimeSchedule({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const isCompact = width < 360;

  const [startTime, setStartTime] = useState('08:30 AM');
  const [endTime, setEndTime] = useState('06:00 PM');
  const [openPicker, setOpenPicker] = useState<OpenPicker>(null);

  const [repeatType, setRepeatType] = useState<RepeatType>('weekdays');
  const [selectedDays, setSelectedDays] = useState<DayKey[]>([
    'M',
    'T1',
    'W',
    'T2',
    'F',
  ]);

  const presets = useMemo<Preset[]>(
    () => [
      {
        id: 'business',
        title: 'Business Hours',
        time: '9:00 AM - 5:00 PM',
        start: '09:00 AM',
        end: '05:00 PM',
      },
      {
        id: 'extended',
        title: 'Extended Hours',
        time: '8:00 AM - 6:00 PM',
        start: '08:00 AM',
        end: '06:00 PM',
      },
      {
        id: 'full-day',
        title: 'Full Day',
        time: '7:00 AM - 7:00 PM',
        start: '07:00 AM',
        end: '07:00 PM',
      },
      {
        id: 'afternoon',
        title: 'Afternoon/Evening',
        time: '12:00 PM - 9:00 PM',
        start: '12:00 PM',
        end: '09:00 PM',
      },
    ],
    [],
  );

  const applyRepeatType = (type: RepeatType) => {
    setRepeatType(type);

    if (type === 'weekdays') {
      setSelectedDays(['M', 'T1', 'W', 'T2', 'F']);
    } else if (type === 'weekend') {
      setSelectedDays(['S1', 'S2']);
    } else {
      setSelectedDays(['M', 'T1', 'W', 'T2', 'F', 'S1', 'S2']);
    }
  };

  const toggleDay = (day: DayKey) => {
    setSelectedDays(prev => {
      const exists = prev.includes(day);
      if (exists) {
        return prev.filter(d => d !== day);
      }
      return [...prev, day];
    });
    setRepeatType('weekdays');
  };

  const selectedScheduleText = `${startTime} - ${endTime}`;

  const activeDaysText = DAY_META.filter(day => selectedDays.includes(day.key))
    .map(day => day.full)
    .join(', ');

  const onSave = () => {
    navigation.goBack();
  };

  const onPresetPress = (preset: Preset) => {
    setStartTime(preset.start);
    setEndTime(preset.end);
    setOpenPicker(null);
  };

  const togglePicker = (picker: OpenPicker) => {
    setOpenPicker(prev => (prev === picker ? null : picker));
  };

  const onSelectStartTime = (value: string) => {
    setStartTime(value);
    setOpenPicker(null);
  };

  const onSelectEndTime = (value: string) => {
    setEndTime(value);
    setOpenPicker(null);
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
        {/* Orange Header */}
        <View style={styles.topSection}>
          <View style={styles.topHeaderRow}>
            <Pressable
              onPress={() => navigation.goBack()}
              style={styles.backBtn}
            >
                                                             <BackSvg width={16} height={16} />

            </Pressable>

            <Text style={styles.topTitle}>Set Time Schedule</Text>

            <View style={styles.backBtn} />
          </View>
        </View>

        <View style={styles.body}>
          {/* Info box */}
          <View style={styles.infoCard}>
            <ClockSvg width={24} height={24} />

            <Text style={styles.infoText}>
              Set your regular away hours. The system will automatically
              activate during this time period.
            </Text>
          </View>

          {/* Start Time */}
          <Text style={styles.sectionLabel}>Start Time</Text>
          <Pressable
            style={[
              styles.selector,
              openPicker === 'start' && styles.selectorOpen,
            ]}
            onPress={() => togglePicker('start')}
          >
            <Text style={styles.selectorText}>{startTime}</Text>
            {openPicker === 'start' ? (
              <UpArrowSvg width={18} height={18} />
            ) : (
              <DropSvg width={18} height={18} />
            )}
          </Pressable>

          {openPicker === 'start' && (
            <View style={styles.dropdownPanel}>
              <ScrollView
                nestedScrollEnabled
                showsVerticalScrollIndicator
                style={styles.dropdownScroll}
              >
                {START_OPTIONS.map(option => {
                  const selected = option === startTime;

                  return (
                    <Pressable
                      key={option}
                      style={[
                        styles.dropdownRow,
                        selected && styles.dropdownRowSelected,
                      ]}
                      onPress={() => onSelectStartTime(option)}
                    >
                      <Text
                        style={[
                          styles.dropdownRowText,
                          selected && styles.dropdownRowTextSelected,
                        ]}
                      >
                        {option}
                      </Text>

                      {selected && <TickSvg width={16} height={16} />}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* End Time */}
          <Text style={styles.sectionLabel}>End Time</Text>
          <Pressable
            style={[
              styles.selector,
              openPicker === 'end' && styles.selectorOpen,
            ]}
            onPress={() => togglePicker('end')}
          >
            <Text style={styles.selectorText}>{endTime}</Text>
            {openPicker === 'end' ? (
              <UpArrowSvg width={18} height={18} />
            ) : (
              <DropSvg width={18} height={18} />
            )}
          </Pressable>

          {openPicker === 'end' && (
            <View style={styles.dropdownPanel}>
              <ScrollView
                nestedScrollEnabled
                showsVerticalScrollIndicator
                style={styles.dropdownScroll}
              >
                {END_OPTIONS.map(option => {
                  const selected = option === endTime;

                  return (
                    <Pressable
                      key={option}
                      style={[
                        styles.dropdownRow,
                        selected && styles.dropdownRowSelected,
                      ]}
                      onPress={() => onSelectEndTime(option)}
                    >
                      <Text
                        style={[
                          styles.dropdownRowText,
                          selected && styles.dropdownRowTextSelected,
                        ]}
                      >
                        {option}
                      </Text>

                      {selected && <TickSvg width={16} height={16} />}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Repeat on Days */}
          <Text style={styles.sectionLabel}>Repeat on Days</Text>

          <View style={styles.repeatTypeRow}>
            <Pressable
              style={[
                styles.repeatChip,
                repeatType === 'weekdays' && styles.repeatChipActive,
              ]}
              onPress={() => applyRepeatType('weekdays')}
            >
              <Text
                style={[
                  styles.repeatChipText,
                  repeatType === 'weekdays' && styles.repeatChipTextActive,
                ]}
              >
                Weekdays
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.repeatChip,
                repeatType === 'weekend' && styles.repeatChipActive,
              ]}
              onPress={() => applyRepeatType('weekend')}
            >
              <Text
                style={[
                  styles.repeatChipText,
                  repeatType === 'weekend' && styles.repeatChipTextActive,
                ]}
              >
                Weekend
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.repeatChip,
                repeatType === 'everyday' && styles.repeatChipActive,
              ]}
              onPress={() => applyRepeatType('everyday')}
            >
              <Text
                style={[
                  styles.repeatChipText,
                  repeatType === 'everyday' && styles.repeatChipTextActive,
                ]}
              >
                Every Day
              </Text>
            </Pressable>
          </View>

          <View style={styles.daysRow}>
            {DAY_META.map(day => {
              const selected = selectedDays.includes(day.key);

              return (
                <Pressable
                  key={day.key}
                  style={[styles.dayBtn, selected && styles.dayBtnActive]}
                  onPress={() => toggleDay(day.key)}
                >
                  <Text
                    style={[
                      styles.dayBtnText,
                      selected && styles.dayBtnTextActive,
                    ]}
                  >
                    {day.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.activeDaysText}>Active on {activeDaysText}</Text>

          {/* Quick Presets */}
          <Text style={styles.sectionTitle}>Quick Presets</Text>

          <View style={styles.presetGrid}>
            {presets.map(preset => (
              <Pressable
                key={preset.id}
                style={styles.presetCard}
                onPress={() => onPresetPress(preset)}
              >
                <Text style={styles.presetTitle}>{preset.title}</Text>
                <Text style={styles.presetTime}>{preset.time}</Text>
              </Pressable>
            ))}
          </View>

          {/* Selected Schedule */}
          <View style={styles.selectedScheduleCard}>
            <Text style={styles.selectedScheduleLabel}>Selected Schedule:</Text>
            <Text style={styles.selectedScheduleValue}>
              {selectedScheduleText}
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <Pressable style={styles.saveBtn} onPress={onSave}>
          <Text style={styles.saveBtnText}>Save Time Schedule</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },

  content: {
    paddingBottom: 110,
  },

  contentCompact: {},

  topSection: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 18,
    paddingTop: 48,
    paddingBottom: 18,
  },

  topHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
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

  body: {
    paddingHorizontal: 18,
    paddingTop: 18,
  },

  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#38BDF8',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },

  infoIcon: {
    width: 24,
    height: 24,
    marginTop: 2,
  },

  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 24,
    fontWeight: '600',
    color: '#374151',
  },

  sectionLabel: {
    marginTop: 24,
    marginBottom: 10,
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },

  selector: {
    height: 88,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  selectorOpen: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },

  selectorText: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '700',
  },

  selectorIcon: {
    width: 22,
    height: 22,
  },

  dropdownPanel: {
    maxHeight: 320,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    overflow: 'hidden',
  },

  dropdownScroll: {
    maxHeight: 320,
  },

  dropdownRow: {
    minHeight: 56,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  dropdownRowSelected: {
    backgroundColor: '#F3F4F6',
  },

  dropdownRowText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#374151',
  },

  dropdownRowTextSelected: {
    color: '#111827',
    fontWeight: '700',
  },

  checkIcon: {
    width: 20,
    height: 20,
  },

  repeatTypeRow: {
    flexDirection: 'row',
    gap: 10,
  },

  repeatChip: {
    flex: 1,
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },

  repeatChipActive: {
    borderColor: '#2362EB',
    backgroundColor: '#EEF2FF',
  },

  repeatChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },

  repeatChipTextActive: {
    color: '#2362EB',
  },

  daysRow: {
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },

  dayBtn: {
    flex: 1,
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  dayBtnActive: {
    backgroundColor: '#2362EB',
    borderColor: '#2362EB',
  },

  dayBtnText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4B5563',
  },

  dayBtnTextActive: {
    color: '#FFFFFF',
  },

  activeDaysText: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '500',
    color: '#6B7280',
  },

  sectionTitle: {
    marginTop: 26,
    marginBottom: 14,
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
  },

  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14,
  },

  presetCard: {
    width: '48%',
    minHeight: 92,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 14,
  },

  presetTitle: {
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    color: '#111827',
  },

  presetTime: {
    marginTop: 6,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    color: '#6B7280',
  },

  selectedScheduleCard: {
    marginTop: 18,
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 18,
    paddingVertical: 18,
  },

  selectedScheduleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },

  selectedScheduleValue: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: '900',
    color: '#2362EB',
  },

  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 18,
  },

  saveBtn: {
    height: 56,
    borderRadius: 14,
    backgroundColor: '#2362EB',
    alignItems: 'center',
    justifyContent: 'center',
  },

  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
});
