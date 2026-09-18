import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import MembersList from '../../../features/members/screens/MembersList';
import AddMember from '../../../features/members/screens/AddMember';

export type MembersStackParamList = {
    MembersList:
    | {
        addedMember?: {
          id: string;
          name: string;
          email?: string;
          phone?: string;
          accessLabel?: string;
          badge?: string;
          accessLevel: 'full' | 'simple' | 'none';
          status?: 'pending' | 'active';
        };
      }
    | undefined;
  AddMember: undefined;
};

const Stack = createNativeStackNavigator<MembersStackParamList>();

export default function MembersStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="MembersList"
        component={MembersList}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AddMember"
        component={AddMember}
        options={{
          headerShown: false,
          presentation: 'transparentModal',
          animation: 'fade',
        }}
      />
      
    </Stack.Navigator>
  );
}
