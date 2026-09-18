import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import Home from '../../../features/home/screens/Home';
import NotificationsInbox from '../../../features/home/screens/NotificationsInbox';

export type HomeStackParamList = {
  Home: undefined;
  NotificationsInbox: undefined;
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

export default function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={Home} />
      <Stack.Screen name="NotificationsInbox" component={NotificationsInbox} />
    </Stack.Navigator>
  );
}




// import React from 'react';
// import { createNativeStackNavigator } from '@react-navigation/native-stack';

// import Home from '../../../features/home/screens/Home';
// import LiveFeed from '../../../features/home/screens/LiveFeed';
// import SecurityAccessControl from '../../../features/security/screens/SecurityAccessControl';
// import DeliveryRecordings from '../../../features/recordings/screens/DeliveryRecordings';
// import RecordingDetails from '../../../features/recordings/screens/RecordingDetails';

// export type HomeStackParamList = {
//   Home: undefined;
//   LiveFeed: undefined;
//   SecurityAccessControl: undefined;
//   DeliveryRecordings: undefined;
//   RecordingDetails: {
//     recordingId: string;
//   };
// };

// const Stack = createNativeStackNavigator<HomeStackParamList>();

// export default function HomeStack() {
//   return (
//     <Stack.Navigator screenOptions={{ headerShown: false }}>
//       <Stack.Screen name="Home" component={Home} />
//       <Stack.Screen name="LiveFeed" component={LiveFeed} />
//       <Stack.Screen
//         name="SecurityAccessControl"
//         component={SecurityAccessControl}
//       />
//       <Stack.Screen name="DeliveryRecordings" component={DeliveryRecordings} />
//       <Stack.Screen name="RecordingDetails" component={RecordingDetails} />
//     </Stack.Navigator>
//   );
// }

// // src/assets/images/recording-thumb-1.png
