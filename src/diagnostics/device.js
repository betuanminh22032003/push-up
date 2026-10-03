import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * What a report says about the phone, from what React Native already knows:
 * no extra package, no identifiers. Model and Android version only.
 */
export function deviceInfo() {
  const c = Platform.constants || {};
  return {
    os: Platform.OS,
    osVersion: Platform.OS === 'android' ? `${c.Release ?? ''} (API ${Platform.Version})`.trim() : String(Platform.Version ?? ''),
    brand: c.Brand || c.Manufacturer || null,
    model: c.Model || (Platform.OS === 'web' && typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 120) : null),
  };
}

export function appInfo() {
  return {
    version: Constants.expoConfig?.version ?? '1.0.0',
    build: Constants.expoConfig?.android?.versionCode ?? null,
  };
}
