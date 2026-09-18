/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import {
  registerCallNotificationBackgroundHandler,
  registerNotificationBackgroundHandler,
} from './src/services/notifications/pushNotifications';

registerNotificationBackgroundHandler();
registerCallNotificationBackgroundHandler();

AppRegistry.registerComponent(appName, () => App);
