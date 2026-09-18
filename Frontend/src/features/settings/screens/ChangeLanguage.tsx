import React, { useEffect, useMemo, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CommonActions } from '@react-navigation/native';
import type { SvgProps } from 'react-native-svg';

import type { RootStackParamList } from '../../../navigation/RootNavigator';
import BlueHeader from '../../../components/layout/BlueHeader';
import IndiaFlagIcon from '../../../assets/icons/settings/change-language/in.svg';
import UkFlagIcon from '../../../assets/icons/settings/change-language/uk.svg';
import SelectCircleIcon from '../../../assets/icons/settings/change-language/select-circle.svg';
import SelectIcon from '../../../assets/icons/settings/change-language/select.svg';

import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import {
  preferencesActions,
  type AppLanguage,
} from '../../../store/slices/preferencesSlice';
import { setStoredLanguage } from '../../../services/storage/languageStorage';
import { i18n, useAppTranslation } from '../../../services/i18n';

type Props = NativeStackScreenProps<RootStackParamList, 'ChangeLanguage'>;

type LanguageItem = {
  id: AppLanguage;
  title: string;
  nativeLabel: string;
  FlagIcon: React.ComponentType<SvgProps>;
};

export default function ChangeLanguage({ navigation }: Props) {
  const dispatch = useAppDispatch();
  const savedLanguage = useAppSelector(state => state.preferences.language);
  const { t } = useAppTranslation();

  const languages = useMemo<LanguageItem[]>(
    () => [
      {
        id: 'en',
        title: 'English',
        nativeLabel: 'English',
        FlagIcon: UkFlagIcon,
      },
      {
        id: 'hi',
        title: 'Hindi',
        nativeLabel: '\u0939\u093f\u0928\u094d\u0926\u0940',
        FlagIcon: IndiaFlagIcon,
      },
      {
        id: 'ta',
        title: 'Tamil',
        nativeLabel: '\u0ba4\u0bae\u0bbf\u0bb4\u0bcd',
        FlagIcon: IndiaFlagIcon,
      },
      {
        id: 'te',
        title: 'Telugu',
        nativeLabel: '\u0c24\u0c46\u0c32\u0c41\u0c17\u0c41',
        FlagIcon: IndiaFlagIcon,
      },
      {
        id: 'bn',
        title: 'Bengali',
        nativeLabel: '\u09ac\u09be\u0982\u09b2\u09be',
        FlagIcon: IndiaFlagIcon,
      },
      {
        id: 'mr',
        title: 'Marathi',
        nativeLabel: '\u092e\u0930\u093e\u0920\u0940',
        FlagIcon: IndiaFlagIcon,
      },
      {
        id: 'gu',
        title: 'Gujarati',
        nativeLabel: '\u0a97\u0ac1\u0a9c\u0ab0\u0abe\u0aa4\u0ac0',
        FlagIcon: IndiaFlagIcon,
      },
      {
        id: 'kn',
        title: 'Kannada',
        nativeLabel: '\u0c95\u0ca8\u0ccd\u0ca8\u0ca1',
        FlagIcon: IndiaFlagIcon,
      },
      {
        id: 'ml',
        title: 'Malayalam',
        nativeLabel: '\u0d2e\u0d32\u0d2f\u0d3e\u0d33\u0d02',
        FlagIcon: IndiaFlagIcon,
      },
      {
        id: 'pa',
        title: 'Punjabi',
        nativeLabel: '\u0a2a\u0a70\u0a1c\u0a3e\u0a2c\u0a40',
        FlagIcon: IndiaFlagIcon,
      },
    ],
    [],
  );

  const [selectedLanguage, setSelectedLanguage] = useState<AppLanguage>('en');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setSelectedLanguage(savedLanguage);
  }, [savedLanguage]);

  const onConfirm = async () => {
    try {
      setIsSaving(true);
      dispatch(preferencesActions.languageUpdated(selectedLanguage));
      await setStoredLanguage(selectedLanguage);
      await i18n.changeLanguage(selectedLanguage);
      await new Promise<void>(resolve => setTimeout(() => resolve(), 450));
      navigation.dispatch(
        CommonActions.navigate({
          name: 'MainTabs',
          params: {
            screen: 'SettingsStack',
            params: { screen: 'SettingsHome' },
          },
        }),
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <BlueHeader
        title={t('change_language')}
        onBackPress={() => navigation.goBack()}
        compact
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>{t('select_preferred_language')}</Text>

        <View style={styles.listWrap}>
          {languages.map(item => {
            const selected = item.id === selectedLanguage;
            const FlagIcon = item.FlagIcon;
            const SelectionIcon = selected ? SelectIcon : SelectCircleIcon;
            const statusLabel = t('available_now');

            return (
              <Pressable
                key={item.id}
                style={[
                  styles.languageCard,
                  selected && styles.languageCardSelected,
                ]}
                onPress={() => setSelectedLanguage(item.id)}
              >
                <View style={styles.leftWrap}>
                  <FlagIcon
                    width={styles.flagIcon.width}
                    height={styles.flagIcon.height}
                    style={styles.flagIcon}
                  />

                  <View style={styles.textWrap}>
                    <Text style={styles.languageTitle}>{item.title}</Text>
                    <Text style={styles.languageNative}>
                      {item.nativeLabel}
                    </Text>
                  </View>
                </View>

                <View style={styles.trailingWrap}>
                  <Text
                    style={[
                      styles.statusText,
                      styles.statusTextAvailable,
                    ]}
                  >
                    {statusLabel}
                  </Text>
                  <SelectionIcon
                    width={styles.checkIcon.width}
                    height={styles.checkIcon.height}
                    style={styles.checkIcon}
                  />
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <View style={styles.bottomBar}>
        <Pressable
          style={[styles.confirmBtn, isSaving && styles.confirmBtnDisabled]}
          onPress={onConfirm}
          disabled={isSaving}
        >
          <Text style={styles.confirmText}>
            {isSaving ? t('saving') : t('confirm_language')}
          </Text>
        </Pressable>
      </View>

      {isSaving ? (
        <View style={styles.loadingOverlay} pointerEvents="auto">
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#2362EB" />
            <Text style={styles.loadingText}>{t('saving')}</Text>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  content: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 24,
  },

  subtitle: {
    fontSize: 14,
    lineHeight: 22,
    color: '#6B7280',
    fontWeight: '500',
    marginBottom: 18,
  },

  listWrap: {
    gap: 14,
  },

  languageCard: {
    minHeight: 98,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  languageCardSelected: {
    borderWidth: 2,
    borderColor: '#2362EB',
  },

  leftWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },

  flagIcon: {
    width: 48,
    height: 48,
    marginRight: 14,
  },

  textWrap: {
    flex: 1,
  },

  trailingWrap: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 88,
    gap: 8,
  },

  languageTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },

  languageNative: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },

  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },

  statusTextAvailable: {
    color: '#2362EB',
  },

  checkIcon: {
    width: 24,
    height: 24,
  },

  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 16,
  },

  confirmBtn: {
    height: 56,
    borderRadius: 14,
    backgroundColor: '#2362EB',
    alignItems: 'center',
    justifyContent: 'center',
  },

  confirmBtnDisabled: {
    backgroundColor: '#9BB7F0',
  },

  confirmText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },

  bottomSpacer: {
    height: 96,
  },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.24)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  loadingBox: {
    width: 168,
    minHeight: 132,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 20,
  },

  loadingText: {
    marginTop: 14,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
});
