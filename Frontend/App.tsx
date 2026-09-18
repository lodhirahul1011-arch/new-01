import React from 'react';
import './src/services/i18n';
import { Provider } from 'react-redux';
import { store } from './src/store';
import RootNavigator from './src/navigation/RootNavigator';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import NotificationBootstrap from './src/components/NotificationBootstrap';
import { ThemeProvider } from './src/theme/ThemeContext';

export default function App() {
  //   const clearStorage = async ()=>{
  // await AsyncStorage.removeItem('app.onboardingCompleted');
  //   }
  //   clearStorage();
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Provider store={store}>
        <ThemeProvider>
          <RootNavigator />
          <NotificationBootstrap />
        </ThemeProvider>
      </Provider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
