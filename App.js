import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppRoot } from './src/shell/AppRoot';
import { I18nProvider } from './src/i18n/I18nContext';
import { SessionsProvider } from './src/state/SessionsContext';
import { SettingsProvider } from './src/state/SettingsContext';

// Keep the native splash up until settings and history are loaded, so the
// first frame is the real home screen rather than a flash of empty stats.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <SessionsProvider>
          <I18nProvider>
            <AppRoot />
          </I18nProvider>
        </SessionsProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
