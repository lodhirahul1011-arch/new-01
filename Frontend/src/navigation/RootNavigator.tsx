import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SplashScreen from '../features/onboarding/screens/SplashScreen';

import Login from '../features/auth/screens/Login';
import Signup from '../features/auth/screens/Signup';
import Otp from '../features/auth/screens/Otp';
import AccountVerified from '../features/auth/screens/AccountVerified';
import ContinueWithEmail from '../features/auth/screens/ContinueWithEmail';
import CheckEmail from '../features/auth/screens/CheckEmail';
import PersonalDetails from '../features/auth/screens/PersonalDetails';
import CountryCodeScreen from '../features/auth/screens/CountryCodeScreen';
import EnterPhoneNumber from '../features/auth/screens/EnterPhoneNumber';

import DeviceSetup from '../features/setup/screens/DeviceSetup';
import QrScannerScreen from '../features/setup/screens/QrScannerScreen';
import Permissions from '../features/setup/screens/Permissions';
import RequestPermissions from '../features/setup/screens/RequestPermissions';
import AskDvaariBox from '../features/setup/screens/AskDvaariBox';

import MainTabs from './tabs/MainTabs';
import Onboarding from '../features/onboarding/screens/Onboarding';
import LiveFeed from '../features/home/screens/LiveFeed';
import IncomingCall from '../features/home/screens/IncomingCall';
import ActiveCall from '../features/home/screens/ActiveCall';
import SecurityAccessControl from '../features/security/screens/SecurityAccessControl';
import DeliveryRecordings from '../features/recordings/screens/DeliveryRecordings';
import RecordingDetails from '../features/recordings/screens/RecordingDetails';
import DeliveryHistory from '../features/delivery/screens/DeliveryHistory';
import DeliveryApproved from '../features/delivery/screens/DeliveryApproved';
import DeliveryRejected from '../features/delivery/screens/DeliveryRejected';
import AwayMode from '../features/away/screens/AwayMode';
import Backup from '../features/away/screens/Backup';
import TimeSchedule from '../features/away/screens/TimeSchedule';
import EditProfile from '../features/settings/screens/EditProfile';
import LinkedDevices from '../features/settings/screens/LinkedDevices';
import DeviceManagement from '../features/settings/screens/DeviceManagement';
import NotificationSettingsScreen from '../features/settings/screens/NotificationSettingsScreen';
import ChangeLanguage from '../features/settings/screens/ChangeLanguage';
import HelpSupport from '../features/settings/screens/HelpSupport';
import NfcCard from '../features/settings/screens/NfcCard';
import { flushPendingCallNavigation, navigationRef } from './navigationRef';
import AppAlertHost from '../components/modals/AppAlert';

export type RootStackParamList = {
  Splash: undefined;
  Onboarding: undefined;
  Login: { selectedCountryIso2?: string } | undefined;
  /** Legacy route retained for existing deep links; new onboarding uses Login. */
  Signup:
    | {
        prefillName?: string;
        prefillEmail?: string;
        prefillPhone?: string;
      }
    | undefined;
  ContinueWithEmail: { linking?: boolean } | undefined;
  CheckEmail: { destination?: string; otpSessionId?: string; debugCode?: string; linking?: boolean } | undefined;
  PersonalDetails:
    | {
        /** Where to go after saving; defaults to onboarding's RequestPermissions. */
        next?: 'DeviceSetup' | 'EnterPhoneNumber' | 'AccountVerified';
        prefillName?: string;
        prefillDob?: string;
        prefillGender?: string;
        prefillPhoto?: string;
      }
    | undefined;
  EnterPhoneNumber:
    | {
        selectedCountryIso2?: string;
        googleName?: string;
        googleEmail?: string;
        googleDob?: string;
        googleGender?: string;
        googlePhoto?: string;
        googleSignup?: boolean;
      }
    | undefined;
  CountryCode: { returnTo?: 'Login' | 'EnterPhoneNumber' } | undefined;
  Otp:
    | {
        destination?: string;
        via?: 'phone' | 'email';
        flow?: 'login' | 'signup';
        otpSessionId?: string;
        otpLength?: 4 | 6;
        debugCode?: string;
        linking?: boolean;
        forcePersonalDetails?: boolean;
        showAccountVerified?: boolean;
        prefillName?: string;
        prefillDob?: string;
        prefillGender?: string;
        prefillPhoto?: string;
      }
    | undefined;
  AccountVerified: undefined;
  RequestPermissions: { next?: 'DeviceSetup' | 'MainTabs' } | undefined;
  DeviceSetup: {
    type: 'device' | 'box';
    from: 'setup' | 'settings';
    hideBackButton?: boolean;
  };
  QrScanner: {
    type: 'device' | 'box';
    from: 'setup' | 'settings';
  };
  AskDvaariBox: undefined;
  Permissions: undefined;
  MainTabs: undefined;
  LiveFeed:
    | {
        linkedCallId?: string;
        title?: string;
      }
    | undefined;
  IncomingCall: {
    callId: string;
    callerName?: string;
    callerPhone?: string;
    callType?: string;
  };
  ActiveCall: {
    callId: string;
    callerName?: string;
    callerPhone?: string;
    callType?: string;
  };
  SecurityAccessControl: undefined;
  DeliveryRecordings: undefined;
  RecordingDetails: { recordingId: string };
  DeliveryHistory: undefined;
  DeliveryApproved:
    | {
        scheduleId?: string;
      }
    | undefined;
  DeliveryRejected:
    | {
        scheduleId?: string;
      }
    | undefined;
  AwayMode: undefined;
  Backup: undefined;
  TimeSchedule: undefined;
  EditProfile: undefined;
  LinkedDevices: undefined;
  DeviceManagement: undefined;
  NotificationSettingsScreen: undefined;
  ChangeLanguage: undefined;
  HelpSupport: undefined;
  NfcCard: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef} onReady={flushPendingCallNavigation}>
        <Stack.Navigator
          screenOptions={{ headerShown: false }}
          initialRouteName="Splash"
        >
          <Stack.Screen name="Splash" component={SplashScreen} />
          <Stack.Screen name="Onboarding" component={Onboarding} />
          <Stack.Screen name="Login" component={Login} />
          <Stack.Screen name="Signup" component={Signup} />
          <Stack.Screen name="ContinueWithEmail" component={ContinueWithEmail} />
          <Stack.Screen name="CheckEmail" component={CheckEmail} />
          <Stack.Screen name="PersonalDetails" component={PersonalDetails} />
          <Stack.Screen name="EnterPhoneNumber" component={EnterPhoneNumber} />
          <Stack.Screen name="CountryCode" component={CountryCodeScreen} />
          <Stack.Screen name="Otp" component={Otp} />
          <Stack.Screen name="AccountVerified" component={AccountVerified} />
          <Stack.Screen name="DeviceSetup" component={DeviceSetup} />
          <Stack.Screen name="QrScanner" component={QrScannerScreen} />
          <Stack.Screen name="RequestPermissions" component={RequestPermissions} />
          <Stack.Screen name="AskDvaariBox" component={AskDvaariBox} />
          <Stack.Screen name="Permissions" component={Permissions} />
          <Stack.Screen name="MainTabs" component={MainTabs} />
          <Stack.Screen name="LiveFeed" component={LiveFeed} />
          <Stack.Screen
            name="IncomingCall"
            component={IncomingCall}
            options={{ gestureEnabled: false }}
          />
          <Stack.Screen
            name="ActiveCall"
            component={ActiveCall}
            options={{ gestureEnabled: false }}
          />
          <Stack.Screen
            name="SecurityAccessControl"
            component={SecurityAccessControl}
          />
          <Stack.Screen
            name="DeliveryRecordings"
            component={DeliveryRecordings}
          />
          <Stack.Screen name="RecordingDetails" component={RecordingDetails} />
          <Stack.Screen name="DeliveryHistory" component={DeliveryHistory} />
          <Stack.Screen name="DeliveryApproved" component={DeliveryApproved} />
          <Stack.Screen name="DeliveryRejected" component={DeliveryRejected} />
          <Stack.Screen name="AwayMode" component={AwayMode} />
          <Stack.Screen name="Backup" component={Backup} />
          <Stack.Screen name="TimeSchedule" component={TimeSchedule} />
          <Stack.Screen name="EditProfile" component={EditProfile} />
          <Stack.Screen name="LinkedDevices" component={LinkedDevices} />
          <Stack.Screen name="DeviceManagement" component={DeviceManagement} />
          <Stack.Screen
            name="NotificationSettingsScreen"
            component={NotificationSettingsScreen}
          />
          <Stack.Screen name="ChangeLanguage" component={ChangeLanguage} />
          <Stack.Screen name="HelpSupport" component={HelpSupport} />
          <Stack.Screen name="NfcCard" component={NfcCard} />
        </Stack.Navigator>
      </NavigationContainer>
      <AppAlertHost />
    </SafeAreaProvider>
  );
}
