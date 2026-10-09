import { Platform } from 'react-native';

import { recordError } from './errorLog';

let installed = false;

/** The longest a fatal error waits for its log entry to be written. */
const FATAL_WRITE_WAIT_MS = 1000;

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
      const written = recordError(error, { fatal: !!isFatal, source: 'global' });
      // In a release build the previous handler ends the process on a fatal
      // error, before an AsyncStorage write could land: give the write a
      // moment first, so the crash is in the log the next time the app opens.
      if (isFatal && !__DEV__) {
        const timeout = new Promise((resolve) => setTimeout(resolve, FATAL_WRITE_WAIT_MS));
        Promise.race([written, timeout]).finally(() => previous?.(error, isFatal));
      } else {
        previous?.(error, isFatal);
      }
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
