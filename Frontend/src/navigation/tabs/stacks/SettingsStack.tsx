import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import SettingsHome from '../../../features/settings/screens/SettingsHome';
import EditProfile from '../../../features/settings/screens/EditProfile';
import LinkedDevices from '../../../features/settings/screens/LinkedDevices';
import AccountSettings from '../../../features/settings/screens/AccountSettings';
import { logs } from '../../../services/logs';

export type SettingsStackParamList = {
  SettingsHome: undefined;
  EditProfile: undefined;
  LinkedDevices: undefined;
  AccountSettings: undefined;
};

const Stack = createNativeStackNavigator<SettingsStackParamList>();

export default function SettingsStack() {
  React.useEffect(() => {
    try {
      logs.info('[settings-stack] initialized without captured notification test screen');
    } catch (error) {
      logs.error('[settings-stack] initialization log failed', String(error));
    }
  }, []);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="SettingsHome"
        component={SettingsHome}
        // options={{ headerShown: false }}
      />
      <Stack.Screen
        name="EditProfile"
        component={EditProfile}
        // options={{ headerShown: false }}
      />
      <Stack.Screen
        name="LinkedDevices"
        component={LinkedDevices}
        // options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AccountSettings"
        component={AccountSettings}
        // options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
