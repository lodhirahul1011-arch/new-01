import React, { useMemo, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../../navigation/RootNavigator';
import BlueHeader from '../../../components/layout/BlueHeader';

type Props = NativeStackScreenProps<RootStackParamList, 'Backup'>;

type BackupPerson = {
  id: string;
  name: string;
  assignedDate: string;
  status: 'Active' | 'expired';
  statusText: string;
};

export default function Backup({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const isCompact = width < 360;

  const [guestName, setGuestName] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [isAssigning, setIsAssigning] = useState(false);

  const otpCode = '3451';

  const assignedPersons = useMemo<BackupPerson[]>(
    () => [
      {
        id: '1',
        name: 'Sara Wilson',
        assignedDate: 'Assigned 30/01/2026',
        status: 'Active',
        statusText: '2h left',
      },
      {
        id: '2',
        name: 'Roman Regins',
        assignedDate: 'Assigned 29/01/2026',
        status: 'expired',
        statusText: 'Expired',
      },
    ],
    [],
  );

  const cleanedGuestName = guestName.trim();
  const canAssign = cleanedGuestName.length >= 2 && !isAssigning;

  const onChangeGuestName = (text: string) => {
    setError(undefined);

    let next = text.replace(/\s{2,}/g, ' ');
    next = next.replace(/^\s+/, '');

    setGuestName(next);
  };

  const onAssign = async () => {
    if (!canAssign) {
      setError('Please enter a valid guest name.');
      return;
    }

    try {
      setIsAssigning(true);

      // later: await assignBackupPersonApi({ guestName: cleanedGuestName, otpCode })
      await new Promise<void>(resolve => setTimeout(resolve, 400));

      // success -> back to Away Mode
      navigation.goBack();
    } catch (error) {
      void error;
      setError('Could not assign backup person. Please try again.');
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <BlueHeader
        title="Backup"
        onBackPress={() => navigation.goBack()}
        compact
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          isCompact && styles.contentCompact,
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.pageTitle}>Assign Backup Person</Text>
        <Text style={styles.pageSubtitle}>
          Assign your existing OTP to a backup person.
        </Text>

        <View style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>OTP Code</Text>
          <Text style={styles.infoCardValue}>{otpCode}</Text>
        </View>

        <Text style={styles.label}>
          Guest Name <Text style={styles.required}>*</Text>
        </Text>

        <TextInput
          value={guestName}
          onChangeText={onChangeGuestName}
          placeholder="Enter guest name"
          placeholderTextColor="#9CA3AF"
          style={styles.input}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          maxLength={50}
        />

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <View style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>Access Validity</Text>
          <Text style={styles.infoCardDescription}>
            The backup person will have access for 24 hours from assignment
          </Text>
        </View>

        <Pressable
          onPress={onAssign}
          disabled={!canAssign}
          style={[
            styles.assignBtn,
            !canAssign && styles.assignBtnDisabled,
          ]}
        >
          <Text style={styles.assignBtnText}>
            {isAssigning ? 'Assigning...' : 'Assign'}
          </Text>
        </Pressable>

        <Text style={styles.sectionTitle}>Assigned Backup Persons</Text>

        <View style={styles.peopleCard}>
          {assignedPersons.map((item, index) => (
            <View key={item.id}>
              <View style={styles.personRow}>
                <View style={styles.personLeft}>
                  <Text style={styles.personName}>{item.name}</Text>
                  <Text style={styles.personDate}>{item.assignedDate}</Text>
                </View>

                <View style={styles.personRight}>
                  <View
                    style={[
                      styles.statusBadge,
                      item.status === 'Active'
                        ? styles.statusBadgeActive
                        : styles.statusBadgeExpired,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        item.status === 'Active'
                          ? styles.statusBadgeTextActive
                          : styles.statusBadgeTextExpired,
                      ]}
                    >
                      {item.status}
                    </Text>
                  </View>

                  <Text style={styles.statusMeta}>{item.statusText}</Text>
                </View>
              </View>

              {index !== assignedPersons.length - 1 && (
                <View style={styles.divider} />
              )}
            </View>
          ))}
        </View>

        <View style={{ height: 18 }} />
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
    padding: 18,
  },

  contentCompact: {
    padding: 14,
  },

  pageTitle: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '800',
    color: '#111827',
  },

  pageSubtitle: {
    marginTop: 10,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
    color: '#4B5563',
  },

  infoCard: {
    marginTop: 18,
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },

  infoCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },

  infoCardValue: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },

  infoCardDescription: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 24,
    fontWeight: '500',
    color: '#374151',
  },

  label: {
    marginTop: 24,
    marginBottom: 10,
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },

  required: {
    color: '#DC2626',
  },

  input: {
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    color: '#111827',
    fontSize: 16,
    fontWeight: '500',
  },

  errorText: {
    marginTop: 8,
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '600',
  },

  assignBtn: {
    marginTop: 22,
    height: 54,
    borderRadius: 12,
    backgroundColor: '#2362EB',
    alignItems: 'center',
    justifyContent: 'center',
  },

  assignBtnDisabled: {
    backgroundColor: '#9BB7F0',
  },

  assignBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },

  sectionTitle: {
    marginTop: 34,
    marginBottom: 16,
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '800',
    color: '#111827',
  },

  peopleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },

  personRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
  },

  personLeft: {
    flex: 1,
  },

  personName: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
    color: '#111827',
  },

  personDate: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
    color: '#4B5563',
  },

  personRight: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    minWidth: 84,
  },

  statusBadge: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
  },

  statusBadgeActive: {
    backgroundColor: '#22C55E',
  },

  statusBadgeExpired: {
    backgroundColor: '#F3F4F6',
  },

  statusBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'lowercase',
  },

  statusBadgeTextActive: {
    color: '#FFFFFF',
  },

  statusBadgeTextExpired: {
    color: '#6B7280',
  },

  statusMeta: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },

  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
  },
});
