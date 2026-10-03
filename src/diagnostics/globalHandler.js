import { Platform } from 'react-native';

import { recordError } from './errorLog';

let installed = false;

/**
 * Log every uncaught JavaScript error locally (./errorLog), then let the
 * previous handler do what it always did: React Native's red box in
 * development, the crash in a release build. Nothing is sent anywhere.
 *
 * Called once, before the app renders (index.js).
 */
export function installGlobalErrorHandler() {
  if (installed) return;
  installed = true;

  const errorUtils = globalThis.ErrorUtils;
  if (errorUtils?.setGlobalHandler) {
    const previous = errorUtils.getGlobalHandler?.();
    errorUtils.setGlobalHandler((error, isFatal) => {
      recordError(error, { fatal: !!isFatal, source: 'global' });
      previous?.(error, isFatal);
    });
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.addEventListener('error', (event) => {
      recordError(event.error || event.message, { source: 'global' });
    });
    window.addEventListener('unhandledrejection', (event) => {
      recordError(event.reason, { source: 'promise' });
    });
  }
}
