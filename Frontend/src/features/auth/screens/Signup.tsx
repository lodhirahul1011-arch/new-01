import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ScrollView,
  ImageBackground,
  useWindowDimensions
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import type { RootStackParamList } from '../../../navigation/RootNavigator';
import LegalAgreementCheckbox from '../components/LegalAgreementCheckbox';
import { useDeviceRegistrationRequestOtpMutation } from '../../../services/api/authApi';
import { logs } from '../../../services/logs';

type Props = NativeStackScreenProps<RootStackParamList, 'Signup'>;

const EMAIL_REGEX =
  /^(?!.*\.\.)[A-Za-z0-9._%+-]+(?<!\.)@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const PHONE_REGEX = /^\+91\s?[6-9]\d{9}$/;
const NAME_REGEX = /^[A-Za-z]+(?: [A-Za-z]+)*$/;

type SignupErrors = {
  name: string;
  email: string;
  phone: string;
  legalAgreement: string;
};

function validateName(value: string) {
  const trimmed = value.trim();

  if (!trimmed) return 'Name is required.';
  if (trimmed.length < 2) return 'Name must be at least 2 characters.';
  if (!NAME_REGEX.test(trimmed)) {
    return 'Name can contain only letters and single spaces.';
  }

  return '';
}

function validateEmail(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return 'Email address is required.';
  if (trimmed.length > 254) return 'Email must be 254 characters or fewer.';
  if (!EMAIL_REGEX.test(trimmed)) return 'Please enter a valid email address.';
  return '';
}

function validatePhone(value: string) {
  if (/[^+\d\s]/.test(value)) return 'Mobile number can contain only digits.';

  const digits = value.replace(/\D/g, '');
  const withoutCountry = digits.startsWith('91') ? digits.slice(2) : digits;

  if (!withoutCountry) return 'Mobile number is required.';
  if (withoutCountry.length !== 10) return 'Enter a valid 10-digit mobile number.';
  if (!/^[6-9]/.test(withoutCountry)) {
    return 'Mobile number must start with 6, 7, 8, or 9.';
  }
  if (!PHONE_REGEX.test(value)) return 'Phone number must be in +91XXXXXXXXXX format.';

  return '';
}

function getSignupErrors(input: {
  name: string;
  email: string;
  phone: string;
  nameInputError?: string;
  emailInputError?: string;
  phoneInputError?: string;
}): SignupErrors {
  return {
    name: input.nameInputError || validateName(input.name),
    email: input.emailInputError || validateEmail(input.email),
    phone: input.phoneInputError || validatePhone(input.phone),
    legalAgreement: '',
  };
}

export default function Signup({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const [name, setName] = useState(route.params?.prefillName ?? '');
  const [email, setEmail] = useState(route.params?.prefillEmail ?? '');
  const [phone, setPhone] = useState(route.params?.prefillPhone ?? '+91 ');
  const [error, setError] = useState<string | undefined>(undefined);
  const [phoneInputError, setPhoneInputError] = useState('');
  const [nameInputError, setNameInputError] = useState('');
  const [emailInputError, setEmailInputError] = useState('');
  const [hasAcceptedLegal, setHasAcceptedLegal] = useState(false);
  const [legalTouched, setLegalTouched] = useState(false);

  const [nameTouched, setNameTouched] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);

  const [requestSignupOtp, { isLoading }] =
    useDeviceRegistrationRequestOtpMutation();

  useEffect(() => {
    if (route.params?.prefillName) {
      setName(route.params.prefillName);
    }
    if (route.params?.prefillEmail) {
      setEmail(route.params.prefillEmail);
    }
    if (route.params?.prefillPhone) {
      setPhone(route.params.prefillPhone);
    }
  }, [
    route.params?.prefillName,
    route.params?.prefillEmail,
    route.params?.prefillPhone,
  ]);

  const cleanedName = useMemo(() => name.trim(), [name]);
  const cleanedEmail = useMemo(() => email.trim().toLowerCase(), [email]);

  // API ke liye no-space phone
  const cleanedPhone = useMemo(() => phone.replace(/\s/g, '').trim(), [phone]);

  const signupErrors = useMemo(
    () =>
      getSignupErrors({
        name: cleanedName,
        email: cleanedEmail,
        phone: cleanedPhone,
        nameInputError,
        emailInputError,
        phoneInputError,
      }),
    [cleanedName, cleanedEmail, cleanedPhone, nameInputError, emailInputError, phoneInputError],
  );

  const nameError = nameTouched ? signupErrors.name : '';
  const emailError = emailTouched ? signupErrors.email : '';
  const phoneError = phoneTouched ? signupErrors.phone : '';
  const legalAgreementError =
    legalTouched && !hasAcceptedLegal
      ? 'Please accept the Privacy Policy and Terms & Conditions.'
      : '';

  const handleNameChange = (text: string) => {
    setError(undefined);
    setNameTouched(true);

    const invalidChars = text.replace(/[A-Za-z\s]/g, '');
    if (invalidChars.length > 0) {
      setNameInputError('Only letters and spaces are allowed.');
    } else {
      setNameInputError('');
    }

    let next = text.replace(/[^A-Za-z ]/g, '');
    next = next.replace(/\s{2,}/g, ' ');
    next = next.replace(/^\s+/, '');

    setName(next);
  };

  const handleEmailChange = (text: string) => {
    setError(undefined);
    setEmailTouched(true);
    if (text.length > 254) {
      setEmailInputError('Email must be 254 characters or fewer.');
    } else if (/\s/.test(text)) {
      setEmailInputError('Email address cannot contain spaces.');
    } else {
      setEmailInputError('');
    }

    const next = text.replace(/^\s+/, '').replace(/\s/g, '').slice(0, 254);
    setEmail(next);
  };

  const handlePhoneChange = (text: string) => {
    setError(undefined);
    setPhoneTouched(true);

    const invalidChars = text.replace(/[0-9+\s]/g, '');
    if (invalidChars.length > 0) {
      setPhoneInputError('Only numbers are allowed.');
    } else {
      const digitsForLimit = text.replace(/\D/g, '');
      const withoutCountryForLimit = digitsForLimit.startsWith('91')
        ? digitsForLimit.slice(2)
        : digitsForLimit;

      if (withoutCountryForLimit.length > 10) {
        setPhoneInputError('Mobile number cannot exceed 10 digits.');
      } else {
        setPhoneInputError('');
      }
    }

    // only digits
    let digits = text.replace(/\D/g, '');

    // remove country code if user typed it
    if (digits.startsWith('91')) {
      digits = digits.slice(2);
    }

    digits = digits.slice(0, 10);

    // UI me +91 aur digits ke beech space
    setPhone(digits.length > 0 ? `+91 ${digits}` : '+91 ');
  };

  const onSubmit = async () => {
    setError(undefined);

    setNameTouched(true);
    setEmailTouched(true);
    setPhoneTouched(true);
    setLegalTouched(true);

    const nextErrors = getSignupErrors({
      name: cleanedName,
      email: cleanedEmail,
      phone: cleanedPhone,
      nameInputError,
      emailInputError,
      phoneInputError,
    });

    if (nextErrors.name || nextErrors.email || nextErrors.phone) {
      logs.error('[signup] validation failed before OTP request', nextErrors);
      return;
    }

    if (!hasAcceptedLegal) {
      logs.error('[signup] legal agreement missing before OTP request');
      return;
    }

    if (isLoading) return;

    try {
      logs.info('[signup] OTP request started');
      const payload = {
        name: cleanedName,
        email: cleanedEmail,
        phone: cleanedPhone, // +91XXXXXXXXXX
      };

      const response = await requestSignupOtp(payload).unwrap();

      if (!response?.ok) {
        logs.error('[signup] OTP request returned unsuccessful response');
        setError('Could not send verification code. Please try again.');
        return;
      }

      logs.info('[signup] OTP request completed');
      navigation.navigate('Otp', {
        destination: payload.phone,
        via: 'phone',
        flow: 'signup',
        linking: false,
        otpSessionId: response.otpSessionId,
      });
    } catch (err: any) {
      const apiMessage =
        err?.data?.message ||
        err?.error ||
        'Something went wrong. Please try again.';
      logs.error('Signup request failed', apiMessage);
      setError(apiMessage);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <StatusBar barStyle="light-content" backgroundColor="#0A39C9" />
      <KeyboardAvoidingView
        style={styles.safe}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 20 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ImageBackground
            source={require('../../../assets/images/auth/bg.png')}
            style={[
              styles.topSection,
              {
                height: Math.max(isLandscape ? 150 : height * 0.30, 150),
                paddingHorizontal: width * 0.06,
                paddingTop: Platform.OS === 'ios'
                  ? (isLandscape ? 40 : height * 0.09)
                  : (isLandscape ? 50 : height * 0.11),
              },
            ]}
          >
            <Text style={styles.headerTitle}>Create Account</Text>
            <Text style={styles.headerSub}>
              Register your account today using a{'\n'}valid email or mobile
            </Text>
          </ImageBackground>

          <View style={[styles.card, { paddingHorizontal: width * 0.06 }]}>
            <Text style={styles.cardTitle}>Device Registration</Text>

            <View style={styles.formBlock}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                value={name}
                onChangeText={handleNameChange}
                onFocus={() => setNameTouched(true)}
                onBlur={() => setNameTouched(true)}
                placeholder="Enter your name"
                placeholderTextColor="#666666"
                style={[styles.input, !!nameError && styles.inputError]}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="next"
                maxLength={50}
              />
              {!!nameError && <Text style={styles.errorText}>{nameError}</Text>}

              <Text style={styles.label}>Email Address</Text>
              <TextInput
                value={email}
                onChangeText={handleEmailChange}
                onFocus={() => setEmailTouched(true)}
                onBlur={() => setEmailTouched(true)}
                placeholder="Enter your email address"
                placeholderTextColor="#666666"
                style={[styles.input, !!emailError && styles.inputError]}
                autoCapitalize="none"
                maxLength={254}
                autoCorrect={false}
                keyboardType="email-address"
                returnKeyType="next"
              />
              {!!emailError && (
                <Text style={styles.errorText}>{emailError}</Text>
              )}

              <Text style={styles.label}>Mobile Number</Text>
              <TextInput
                value={phone}
                onChangeText={handlePhoneChange}
                onFocus={() => {
                  setPhoneTouched(true);
                  if (phone === '+91') {
                    setPhone('+91 ');
                  }
                }}
                onBlur={() => setPhoneTouched(true)}
                placeholder="+91 9876543210"
                placeholderTextColor="#666666"
                style={[styles.input, !!phoneError && styles.inputError]}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType={Platform.select({
                  ios: 'phone-pad',
                  android: 'phone-pad',
                })}
                returnKeyType="done"
                maxLength={14}
              />
              {!!phoneError && (
                <Text style={styles.errorText}>{phoneError}</Text>
              )}

              <LegalAgreementCheckbox
                checked={hasAcceptedLegal}
                error={legalAgreementError}
                onChange={checked => {
                  setLegalTouched(true);
                  setHasAcceptedLegal(checked);
                }}
              />

              {!!error && <Text style={styles.errorText}>{error}</Text>}
            </View>

            <View
              style={[
                styles.bottomArea,
                { paddingBottom: Math.max(insets.bottom, 12) },
              ]}
            >
              <Pressable
                onPress={onSubmit}
                style={[
                  styles.primaryBtn,
                  isLoading && styles.primaryBtnDisabled,
                ]}
                disabled={isLoading}
              >
                <Text style={styles.primaryBtnText}>
                  {isLoading ? 'Please wait...' : 'Send Verification Code'}
                </Text>
              </Pressable>

              <View style={styles.footerRow}>
                <Text style={styles.footerText}>Already have an account?</Text>
                <Pressable onPress={() => navigation.replace('Login')}>
                  <Text style={styles.footerLink}> Sign In</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}


const styles = StyleSheet.create({

  safe:{
    flex:1,
    backgroundColor:'#fff'
  },

  scrollContent:{
    flexGrow:1
  },

  topSection:{
    backgroundColor:'#0A39C9',
    justifyContent:'flex-start'
  },

  headerTitle:{
    color:'#FFFFFF',
    fontSize:32,
    fontWeight:'600',
    marginBottom:14
  },

  headerSub:{
    color:'#FFFFFF',
    fontSize:16,
    lineHeight:24
  },

  card:{
    flex:1,
    backgroundColor:'#FFFFFF',
    marginTop:-30,
    borderTopLeftRadius:40,
    borderTopRightRadius:40,
    paddingTop:40,
    paddingBottom:20
  },

  cardTitle:{
    fontSize:24,
    fontWeight:'500',
    color:'#111111',
    marginBottom:32
  },

  formBlock:{
    gap:6
  },

  label:{
    fontSize:16,
    color:'#111111',
    fontWeight:'600',
    marginBottom:8
  },

  input:{
    height:48,
    width:'100%',
    borderRadius:8,
    borderWidth:1,
    paddingHorizontal:16,
    color:'#1F1F1F',
    borderColor:'#E6E6E6',
    backgroundColor:'#FFFFFF'
  },

  inputError: {
    borderColor: '#EA8080',
  },

  errorText:{
    marginBottom:6,
    color:'#EA8080',
    fontSize:12,
    fontWeight:'600'
  },

  bottomArea:{
    paddingTop:20
  },

  primaryBtn:{
    marginTop:32,
    width:'100%',
    height:50,
    borderRadius:8,
    backgroundColor:'#2362EB',
    alignItems:'center',
    justifyContent:'center'
  },

  primaryBtnDisabled:{
    backgroundColor:'#81A5F3'
  },

  primaryBtnText:{
    color:'#FFFFFF',
    fontSize:16,
    fontWeight:'500'
  },

  footerRow:{
    marginTop:20,
    flexDirection:'row',
    justifyContent:'center',
    alignItems:'center'
  },

  footerText:{
    color:'#666666',
    fontSize:16,
    fontWeight:'500'
  },

  footerLink:{
    color:'#184FBF',
    fontSize:16,
    fontWeight:'500'
  }

});
