import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import DeliveryHome from '../../../features/delivery/screens/DeliveryHome';
import { DeliveryUpcomingDetailsScreen } from '../../../features/delivery/screens/DeliveryUpcomingDetails';
import { DeliveryNfcReadyScreen } from '../../../features/delivery/screens/DeliveryNfcReady';

export type DeliveryStackParamList = {
  DeliveryHome: undefined;
  DeliveryDetails: {
    scheduleId?: string;
    deliveryId?: string;
  };
  DeliveryNfcReady: {
    scheduleId: string;
  };
};

const Stack = createNativeStackNavigator<DeliveryStackParamList>();

export default function DeliveryStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DeliveryHome" component={DeliveryHome} />
      <Stack.Screen name="DeliveryDetails" component={DeliveryUpcomingDetailsScreen} />
      <Stack.Screen name="DeliveryNfcReady" component={DeliveryNfcReadyScreen} />
    </Stack.Navigator>
  );
}
