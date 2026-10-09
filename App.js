import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppRoot } from './src/shell/AppRoot';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { I18nProvider } from './src/i18n/I18nContext';
import { BlockerProvider } from './src/state/BlockerContext';
import { ChallengesProvider } from './src/state/ChallengesContext';
import { SessionsProvider } from './src/state/SessionsContext';
import { SettingsProvider } from './src/state/SettingsContext';

// Keep the native splash up until settings and history are loaded, so the
// first frame is the real home screen rather than a flash of empty stats.
SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Be Vietnam Pro, the weights src/theme/theme.js names. Each file is required
 * on its own: the package's index would bundle all eighteen.
 */
const FONTS = {
  BeVietnamPro_300Light: require('@expo-google-fonts/be-vietnam-pro/300Light/BeVietnamPro_300Light.ttf'),
  BeVietnamPro_400Regular: require('@expo-google-fonts/be-vietnam-pro/400Regular/BeVietnamPro_400Regular.ttf'),
  BeVietnamPro_500Medium: require('@expo-google-fonts/be-vietnam-pro/500Medium/BeVietnamPro_500Medium.ttf'),
  BeVietnamPro_600SemiBold: require('@expo-google-fonts/be-vietnam-pro/600SemiBold/BeVietnamPro_600SemiBold.ttf'),
  BeVietnamPro_700Bold: require('@expo-google-fonts/be-vietnam-pro/700Bold/BeVietnamPro_700Bold.ttf'),
  BeVietnamPro_800ExtraBold: require('@expo-google-fonts/be-vietnam-pro/800ExtraBold/BeVietnamPro_800ExtraBold.ttf'),
};

export default function App() {
  // The splash stays up meanwhile (the shell hides it once data is loaded).
  // A font that fails to load is no reason not to start: text falls back to
  // the system font.
  const [fontsLoaded, fontError] = useFonts(FONTS);
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <SettingsProvider>
          <SessionsProvider>
            <ChallengesProvider>
              <I18nProvider>
                <BlockerProvider>
                  <AppRoot />
                </BlockerProvider>
              </I18nProvider>
            </ChallengesProvider>
          </SessionsProvider>
        </SettingsProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
