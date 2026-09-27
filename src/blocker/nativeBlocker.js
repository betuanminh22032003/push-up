import { isRunningInExpoGo, requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import { createDemoBlocker } from './demoBlocker';

/**
 * The native app blocker from modules/app-blocker, or null where it cannot run.
 *
 * Android only, and only in a build that contains the module. Expo Go cannot
 * load custom native code, so there the module is simply absent and the
 * blocker tab says why. requireOptionalNativeModule returns null instead of
 * throwing, so nothing here can take the app down at startup.
 *
 * The development web build gets an in-memory stand-in, only so the screen
 * can be laid out and screenshotted in a browser. It blocks nothing.
 */
function load() {
  if (Platform.OS === 'android') return requireOptionalNativeModule('AppBlocker');
  if (Platform.OS === 'web' && __DEV__) return createDemoBlocker();
  return null;
}

export const NativeBlocker = load();

/** Translation key for why blocking is unavailable here; null when it works. */
export const unavailableReason = (() => {
  if (NativeBlocker) return null;
  if (Platform.OS !== 'android') return 'blocker.androidOnly';
  return isRunningInExpoGo() ? 'blocker.expoGo' : 'blocker.needsUpdate';
})();
