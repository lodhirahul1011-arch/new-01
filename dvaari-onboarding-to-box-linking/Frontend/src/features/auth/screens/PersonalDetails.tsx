import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Image,
  Modal,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

import type { RootStackParamList } from '../../../navigation/RootNavigator';
import { useUpdateProfileMutation } from '../../../services/api/authApi';
import { useAppDispatch } from '../../../store/hooks';
import { authActions } from '../../../store/slices/authSlice';
import ArrowLeftSvg from '../../../assets/icons/common/arrow-back-otp.svg';
import ArrowLeftWhiteIcon from '../../../assets/icons/common/arrow-back-otp-white.svg';
import CalendarIcon from '../../../assets/icons/auth/calendar.svg';
import CalendarWhiteIcon from '../../../assets/icons/auth/calendar-white.svg';
import ChevronRightThinIcon from '../../../assets/icons/auth/chevron-right-thin.svg';
import ChevronRightThinWhiteIcon from '../../../assets/icons/auth/chevron-right-thin-white.svg';
import UserIcon from '../../../assets/icons/auth/user.svg';
import UserWhiteIcon from '../../../assets/icons/auth/user-white.svg';
import {
  SCREEN_PADDING_H,
  BOTTOM_BUTTON_GAP,
  PRIMARY_BUTTON,
  HEADER_TITLE_SIZE,
  HEADER_TITLE_GAP,
  FIELD_LABEL_SIZE,
} from '../../../theme/metrics';
import { useTheme } from '../../../theme/ThemeContext';
import DarkGlow from '../../../components/ui/DarkGlow';
import OtpRetentionConsentModal from '../../../components/modals/OtpRetentionConsentModal';
import { useUiScale } from '../../../theme/responsive';

type Props = NativeStackScreenProps<RootStackParamList, 'PersonalDetails'>;

// Every number below is copied 1:1 from the Figma frame (fileKey
// 0ZAjL8CnVgprbKaBMIjUqJ, "Personal Details" node 198:568), a 360x812
// canvas, scaled by a single width-based factor — same technique as
// Otp/Login/ContinueWithEmail.
const CANVAS_W = 360;
const HEADER_TOP = 28; // 72 (Figma) - 44 (its status-bar mockup already covered by SafeAreaView)
const HEADER_H = 26;

const DOB_REGEX = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const GENDER_OPTIONS = ['Male', 'Female', 'Prefer not to say'];

function isValidDob(value: string) {
  const match = value.match(DOB_REGEX);
  if (!match) return false;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  return year >= 1900 && year <= new Date().getFullYear();
}

function formatDob(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function parseDob(value: string): Date {
  const match = value.match(DOB_REGEX);
  if (match && isValidDob(value)) {
    return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  }
  return new Date();
}

const THEME = {
  light: {
    background: '#FFFFFF',
    backBtnBg: 'rgba(217,217,217,0.46)',
    backBtnBorder: 'rgba(0,0,0,0.15)',
    title: '#000000',
    fieldLabel: '#000000',
    fieldBoxBg: 'transparent',
    fieldBoxBorder: 'rgba(51,51,51,0.18)',
    inputText: '#000000',
    placeholder: 'rgba(51,51,51,0.28)',
    dropdownBg: '#F2F2F2',
    dropdownDivider: 'rgba(51,51,51,0.18)',
    sheetBg: '#FFFFFF',
  },
  dark: {
    background: '#0F0F10',
    backBtnBg: 'rgba(255,255,255,0.15)',
    backBtnBorder: 'rgba(255,255,255,0.15)',
    title: '#FFFFFF',
    fieldLabel: 'rgba(255,255,255,0.85)',
    fieldBoxBg: 'rgba(255,255,255,0.08)',
    fieldBoxBorder: 'rgba(255,255,255,0.2)',
    inputText: '#FFFFFF',
    placeholder: 'rgba(255,255,255,0.35)',
    dropdownBg: '#282828',
    dropdownDivider: 'rgba(255,255,255,0.15)',
    sheetBg: '#1A1A1B',
  },
};

export default function PersonalDetails({ navigation }: Props) {
  const styles = useStyles();
  const scale = useUiScale(CANVAS_W);
  const s = (n: number) => n * scale;
  const { isDark } = useTheme();
  const palette = isDark ? THEME.dark : THEME.light;
  const dispatch = useAppDispatch();
  const [updateProfile, { isLoading }] = useUpdateProfileMutation();

  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('');
  const [genderOpen, setGenderOpen] = useState(false);
  const [dobPickerVisible, setDobPickerVisible] = useState(false);

  const openDobPicker = () => {
    setTouched(t => ({ ...t, dob: true }));
    setDobPickerVisible(true);
  };

  const onDobPicked = (event: DateTimePickerEvent, selectedDate?: Date) => {
    // Android's picker is its own native dialog that dismisses itself; iOS's
    // renders inline inside the Modal below and stays open until "Done" is
    // tapped, so only Android should close on every change.
    if (Platform.OS === 'android') {
      setDobPickerVisible(false);
    }
    if (event.type === 'set' && selectedDate) {
      setDob(formatDob(selectedDate));
    }
  };

  const toggleGenderOpen = () => {
    setTouched(t => ({ ...t, gender: true }));
    setGenderOpen(open => !open);
  };

  const [touched, setTouched] = useState({ name: false, dob: false, gender: false });
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);
  const [otpConsentVisible, setOtpConsentVisible] = useState(false);

  const nameError = touched.name && name.trim().length === 0 ? 'Name is required.' : undefined;
  const dobError = touched.dob
    ? dob.trim().length === 0
      ? 'Date of birth is required.'
      : !isValidDob(dob.trim())
        ? 'Enter a valid date as DD/MM/YYYY.'
        : undefined
    : undefined;
  const genderError = touched.gender && gender.trim().length === 0 ? 'Please select your gender.' : undefined;

  const isValid = useMemo(
    () =>
      name.trim().length > 0 &&
      isValidDob(dob.trim()) &&
      gender.trim().length > 0,
    [name, dob, gender],
  );

  const onContinue = async () => {
    setSubmitError(undefined);
    setTouched({ name: true, dob: true, gender: true });

    if (!isValid || isLoading) {
      return;
    }

    // Figma 2800:4748: the OTP retention notice is shown over the completed
    // form, and the profile is only saved once the user accepts it.
    setOtpConsentVisible(true);
  };

  const onOtpConsentAccepted = async () => {
    setOtpConsentVisible(false);

    try {
      // The backend profile endpoint only accepts name/address today — date of
      // birth and gender are captured here for the design but are not yet
      // persisted until the API supports them.
      const response = await updateProfile({ name: name.trim() }).unwrap();
      dispatch(authActions.userUpdated(response.user));

      navigation.reset({
        index: 0,
        routes: [{ name: 'RequestPermissions' }],
      });
    } catch (err: any) {
      const apiMessage =
        err?.data?.message || err?.error || 'Could not save your details. Please try again.';
      setSubmitError(apiMessage);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />
      {isDark && <DarkGlow scale={scale} />}
      <KeyboardAvoidingView
        style={{ flex: 1, paddingTop: s(HEADER_TOP) }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.topBar, { height: s(HEADER_H), paddingHorizontal: s(SCREEN_PADDING_H), gap: s(HEADER_TITLE_GAP) }]}>
          <Pressable
            onPress={() =>
              // PersonalDetails is always reached via navigation.reset()
              // (from Otp.tsx's login flow or Splash's session restore), so
              // there's never anything in the back stack for goBack() to
              // return to — go straight to Login instead.
              navigation.reset({ index: 0, routes: [{ name: 'Login' }] })
            }
            hitSlop={8}
            style={{
              width: s(26),
              height: s(26),
              borderRadius: s(13),
              // Figma's back button (node 100:95/198:600, "Ellipse 6"): a
              // translucent gray disc, not a flat opaque fill.
              backgroundColor: palette.backBtnBg,
              borderWidth: s(0.23),
              borderColor: palette.backBtnBorder,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Exact Figma arrow asset ("Vector 9") at its native aspect
                ratio — same asset as the OTP screen's back button. */}
            {isDark ? (
              <ArrowLeftWhiteIcon width={s(11.2071)} height={s(8.70711)} />
            ) : (
              <ArrowLeftSvg width={s(11.2071)} height={s(8.70711)} />
            )}
          </Pressable>
          <Text style={[styles.topBarTitle, { fontSize: s(HEADER_TITLE_SIZE), color: palette.title }]}>
            Personal Information
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, { paddingHorizontal: s(SCREEN_PADDING_H) }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.avatarWrap, { marginTop: s(38) }]}>
            <Image
              source={require('../../../assets/images/auth/default-avatar.png')}
              style={{ width: s(67), height: s(67), borderRadius: s(33.5) }}
            />
          </View>

          <Field label="Name" required s={s} marginTop={s(16)} error={nameError} palette={palette}>
            <TextInput
              value={name}
              onChangeText={setName}
              onBlur={() => setTouched(t => ({ ...t, name: true }))}
              placeholder="Enter your name here"
              placeholderTextColor={palette.placeholder}
              style={[styles.input, { fontSize: s(13), color: palette.inputText }]}
            />
            {isDark ? <UserWhiteIcon width={s(16)} height={s(16)} /> : <UserIcon width={s(16)} height={s(16)} />}
          </Field>

          <Field label="Date of Birth" required s={s} marginTop={s(16)} error={dobError} palette={palette}>
            <TextInput
              value={dob}
              onChangeText={setDob}
              onBlur={() => setTouched(t => ({ ...t, dob: true }))}
              placeholder="Enter your Date of Birth here"
              placeholderTextColor={palette.placeholder}
              keyboardType={Platform.select({ ios: 'numbers-and-punctuation', android: 'default' })}
              style={[styles.input, { fontSize: s(13), color: palette.inputText }]}
            />
            <Pressable onPress={openDobPicker} hitSlop={8}>
              {isDark ? (
                <CalendarWhiteIcon width={s(16)} height={s(16)} />
              ) : (
                <CalendarIcon width={s(16)} height={s(16)} />
              )}
            </Pressable>
          </Field>

          <Field label="Gender" required s={s} marginTop={s(16)} error={genderError} active={genderOpen} palette={palette}>
            <Pressable
              style={styles.genderPressable}
              onPress={toggleGenderOpen}
            >
              <Text
                style={[
                  styles.input,
                  { fontSize: s(13), color: palette.inputText },
                  !gender && { color: palette.placeholder },
                ]}
              >
                {gender || 'Enter your Gender here'}
              </Text>
            </Pressable>
            {/* The chevron used to be a bare icon outside any Pressable, so
                tapping it directly did nothing — only the text label was
                tappable. Wrapping it in its own Pressable (same handler)
                makes the dropdown open from the icon too. */}
            <Pressable onPress={toggleGenderOpen} hitSlop={8}>
              {isDark ? (
                <ChevronRightThinWhiteIcon
                  width={s(8)}
                  height={s(16)}
                  style={{ transform: [{ rotate: genderOpen ? '-90deg' : '90deg' }] }}
                />
              ) : (
                <ChevronRightThinIcon
                  width={s(8)}
                  height={s(16)}
                  style={{ transform: [{ rotate: genderOpen ? '-90deg' : '90deg' }] }}
                />
              )}
            </Pressable>
          </Field>

          {genderOpen && (
            // A plain inline list right under the field — matching Figma's
            // minimal field-box styling instead of a heavy modal sheet.
            <View style={[styles.genderDropdown, { borderRadius: s(10), backgroundColor: palette.dropdownBg }]}>
              {GENDER_OPTIONS.map((option, index) => (
                <Pressable
                  key={option}
                  onPress={() => {
                    setGender(option);
                    setGenderOpen(false);
                  }}
                  style={[
                    { paddingVertical: s(10), paddingHorizontal: s(14) },
                    index > 0 && { borderTopWidth: 0.45, borderTopColor: palette.dropdownDivider },
                  ]}
                >
                  <Text style={[styles.input, { fontSize: s(13), color: palette.inputText }]}>{option}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {!!submitError && <Text style={[styles.submitErrorText, { fontSize: s(13) }]}>{submitError}</Text>}
        </ScrollView>

        {/* The outer SafeAreaView already insets for the device's real
            bottom safe area — this only needs a small extra breathing-room
            gap beyond that, not Figma's mockup gap to its own fake home
            indicator (stacking both doubles the gap). */}
        <View style={[styles.bottomArea, { paddingHorizontal: s(SCREEN_PADDING_H), paddingBottom: s(BOTTOM_BUTTON_GAP) }]}>
          <Pressable
            onPress={onContinue}
            disabled={!isValid || isLoading}
            style={[
              styles.primaryBtn,
              { minHeight: s(PRIMARY_BUTTON.minHeight), borderRadius: s(PRIMARY_BUTTON.radius) },
              (!isValid || isLoading) && styles.primaryBtnDisabled,
            ]}
          >
            <Text style={[styles.primaryBtnText, { fontSize: s(PRIMARY_BUTTON.fontSize) }]}>
              {isLoading ? 'Saving...' : 'Continue'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Android's picker is a native OS dialog — render it directly and it
          handles its own show/hide. iOS renders inline (no dialog of its
          own), so it needs a wrapping sheet with an explicit "Done" button. */}
      {Platform.OS === 'android' && dobPickerVisible && (
        <DateTimePicker
          value={parseDob(dob)}
          mode="date"
          display="default"
          maximumDate={new Date()}
          onChange={onDobPicked}
        />
      )}

      {Platform.OS === 'ios' && (
        <Modal
          visible={dobPickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setDobPickerVisible(false)}
        >
          <TouchableWithoutFeedback onPress={() => setDobPickerVisible(false)}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View style={[styles.sheet, { backgroundColor: palette.sheetBg }]}>
                  <DateTimePicker
                    value={parseDob(dob)}
                    mode="date"
                    display="spinner"
                    maximumDate={new Date()}
                    onChange={onDobPicked}
                  />
                  <Pressable style={styles.sheetCancel} onPress={() => setDobPickerVisible(false)}>
                    <Text style={styles.sheetCancelText}>Done</Text>
                  </Pressable>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}

      <OtpRetentionConsentModal
        visible={otpConsentVisible}
        onAccept={onOtpConsentAccepted}
        onDismiss={() => setOtpConsentVisible(false)}
      />
    </SafeAreaView>
  );
}

function Field({
  label,
  required,
  children,
  s,
  marginTop,
  error,
  active,
  palette,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  s: (n: number) => number;
  marginTop: number;
  error?: string;
  // Figma (node 414:4463) shows the Gender field with a blue #2362eb border
  // while its dropdown is open — a focused/active state, distinct from the
  // red error border.
  active?: boolean;
  palette: { fieldLabel: string; fieldBoxBg: string; fieldBoxBorder: string };
}) {
  const styles = useStyles();
  return (
    <View style={[styles.fieldWrap, { marginTop }]}>
      <View style={[styles.labelRow, { marginBottom: s(8) }]}>
        <Text style={[styles.fieldLabel, { fontSize: s(FIELD_LABEL_SIZE), color: palette.fieldLabel }]}>
          {label}
        </Text>
        {required && (
          <Text style={[styles.required, { fontSize: s(16), lineHeight: s(16) }]}>*</Text>
        )}
      </View>
      <View
        style={[
          styles.fieldBox,
          {
            minHeight: s(40),
            borderRadius: s(5),
            paddingHorizontal: s(10),
            gap: s(10),
            backgroundColor: palette.fieldBoxBg,
            borderColor: palette.fieldBoxBorder,
          },
          active && styles.fieldBoxActive,
          !!error && styles.fieldBoxError,
        ]}
      >
        {children}
      </View>
      {!!error && <Text style={[styles.fieldErrorText, { fontSize: s(11), marginTop: s(4) }]}>{error}</Text>}
    </View>
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
      backgroundColor: '#FFFFFF',
    },

    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
    },

    topBarTitle: {
      fontFamily: 'Satoshi-Medium',
      color: '#000000',
    },

    content: {
      paddingBottom: s(24),
    },

    avatarWrap: {
      alignItems: 'center',
    },

    fieldWrap: {},

    labelRow: { flexDirection: 'row', alignItems: 'center' },

    fieldLabel: {
      fontFamily: 'Satoshi-Regular',
      color: '#000000',
    },

    required: {
      marginLeft: s(3),
      fontFamily: 'Satoshi-Regular',
      color: '#D54747',
    },

    fieldBox: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 0.45,
      borderColor: 'rgba(51,51,51,0.18)',
    },

    fieldBoxError: {
      borderColor: '#EA8080',
    },

    fieldBoxActive: {
      borderColor: '#2362EB',
    },

    genderPressable: {
      flex: 1,
      justifyContent: 'center',
    },

    genderDropdown: {
      // Figma (node 414:4479): a filled #F2F2F2 panel, not a bordered white
      // box.
      backgroundColor: '#F2F2F2',
      overflow: 'hidden',
    },

    genderOptionDivider: {
      borderTopWidth: 0.45,
      borderTopColor: 'rgba(51,51,51,0.18)',
    },

    input: {
      flex: 1,
      fontFamily: 'Satoshi-Regular',
      color: '#000000',
      padding: 0,
      textAlignVertical: 'center',
      includeFontPadding: false,
    },

    fieldErrorText: {
      color: '#EA8080',
      fontFamily: 'Satoshi-Medium',
    },

    submitErrorText: {
      marginTop: s(4),
      color: '#EA8080',
      fontFamily: 'Satoshi-Medium',
    },

    bottomArea: {},

    primaryBtn: {
      alignSelf: 'center',
      width: s(PRIMARY_BUTTON.width),
      maxWidth: '100%',
      backgroundColor: '#2362EB',
      alignItems: 'center',
      justifyContent: 'center',
    },

    primaryBtnDisabled: {
      backgroundColor: 'rgba(35,98,235,0.34)',
    },

    primaryBtnText: {
      color: '#FFFFFF',
      fontFamily: 'Satoshi-Medium',
    },

    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.35)',
      justifyContent: 'flex-end',
    },

    sheet: {
      backgroundColor: '#FFFFFF',
      borderTopLeftRadius: s(16),
      borderTopRightRadius: s(16),
      paddingTop: s(16),
      paddingHorizontal: s(19),
      paddingBottom: s(32),
    },

    sheetCancel: {
      marginTop: s(8),
      paddingVertical: s(14),
      alignItems: 'center',
    },

    sheetCancelText: {
      fontFamily: 'Satoshi-Medium',
      fontSize: s(14),
      color: '#2362EB',
    },
  });
}
