import { Platform } from 'react-native';
import { LightSensor } from 'expo-sensors';

/**
 * Proximity input sources.
 *
 * A "source" converts some hardware/user signal into a stream of boolean
 * proximity states and hands them to `onProximityChange(isNear)`. The rep
 * detector (src/hooks/useRepDetector.js) is the only consumer and knows
 * nothing about which source it is fed by — so adding a real proximity
 * driver later is a change to this file alone.
 *
 * Contract every source implements:
 *   id                 stable key persisted in settings
 *   label / hint       UI copy
 *   isTapDriven        true => the screen surface acts as the sensor
 *   isAvailableAsync() can this device use it right now?
 *   calibrateAsync()   optional; returns { ok, message, ...config }
 *   subscribe(cb, cfg) returns an unsubscribe function
 *
 * NOTE ON expo-sensors: it ships Accelerometer, Barometer, DeviceMotion,
 * Gyroscope, LightSensor, Magnetometer(+Uncalibrated) and Pedometer — there is
 * no proximity sensor. On Android the ambient light sensor sits in the same
 * earpiece cutout as the proximity sensor, so covering it is a faithful and
 * fully working stand-in. iOS exposes no light sensor to JS, so iOS uses the
 * tap source until a native proximity module is added (see NATIVE_PROXIMITY
 * at the bottom of this file).
 */

const SAMPLE_INTERVAL_MS = 60;
const CALIBRATION_MS = 1200;
const MIN_USABLE_BASELINE_LUX = 10;

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Collect illuminance samples for `durationMs`, then resolve with all of them. */
function sampleLight(durationMs) {
  return new Promise((resolve) => {
    const samples = [];
    LightSensor.setUpdateInterval(SAMPLE_INTERVAL_MS);
    const subscription = LightSensor.addListener(({ illuminance }) => {
      if (typeof illuminance === 'number' && Number.isFinite(illuminance)) {
        samples.push(illuminance);
      }
    });
    setTimeout(() => {
      subscription.remove();
      resolve(samples);
    }, durationMs);
  });
}

const lightSource = {
  id: 'light',
  label: 'Proximity sensor',
  hint: 'Phone on the floor, screen up. Cover the sensor at the top of the phone at the bottom of each rep.',
  isTapDriven: false,

  async isAvailableAsync() {
    if (Platform.OS !== 'android') return false;
    try {
      return await LightSensor.isAvailableAsync();
    } catch {
      return false;
    }
  },

  /**
   * Measure the ambient light of the room, then derive two thresholds with a
   * gap between them. The gap is hysteresis: it stops a value hovering on the
   * boundary from rattling between near and far and inflating the count.
   */
  async calibrateAsync() {
    const samples = await sampleLight(CALIBRATION_MS);
    if (samples.length === 0) {
      return { ok: false, message: 'No readings from the light sensor.' };
    }

    const baseline = median(samples);
    if (baseline < MIN_USABLE_BASELINE_LUX) {
      return {
        ok: false,
        baseline,
        message: `Room is too dark to detect cover (${Math.round(baseline)} lx). Turn on a light or switch to Tap mode.`,
      };
    }

    return {
      ok: true,
      baseline,
      nearThreshold: Math.max(baseline * 0.15, 2),
      farThreshold: Math.max(baseline * 0.4, 6),
      message: `Calibrated at ${Math.round(baseline)} lx.`,
    };
  },

  subscribe(onProximityChange, config = {}) {
    const nearThreshold = config.nearThreshold ?? 8;
    const farThreshold = config.farThreshold ?? 20;
    let isNear = false;

    LightSensor.setUpdateInterval(SAMPLE_INTERVAL_MS);
    const subscription = LightSensor.addListener(({ illuminance }) => {
      if (typeof illuminance !== 'number' || !Number.isFinite(illuminance)) return;
      // Between the two thresholds we deliberately hold the current state.
      if (!isNear && illuminance <= nearThreshold) {
        isNear = true;
        onProximityChange(true);
      } else if (isNear && illuminance >= farThreshold) {
        isNear = false;
        onProximityChange(false);
      }
    });

    return () => subscription.remove();
  },
};

/**
 * Tap source: the screen itself is the sensor. Touch down = near, lift = far,
 * so it drives the exact same near/far state machine as real hardware — which
 * also makes it the way to exercise rep logic on a simulator.
 */
const tapSource = {
  id: 'tap',
  label: 'Tap',
  hint: 'Phone on the floor, screen up. Touch the screen with your nose at the bottom of each rep, then release.',
  isTapDriven: true,
  async isAvailableAsync() {
    return true;
  },
  subscribe() {
    // Touch events are delivered by the workout screen via the emitter it owns;
    // there is no background stream to tear down.
    return () => {};
  },
};

/**
 * Camera pose detection. Unlike the others this emits no near/far stream at
 * all — PoseStage owns the camera loop and reports finished reps directly,
 * because the analyser needs the whole skeleton, not a single boolean.
 *
 * Runs everywhere, by two different routes. On web the page owns the camera
 * directly; on native it runs inside a WebView, because expo-camera exposes no
 * frame processor and Expo Go cannot load a native module that does. Either
 * way the counting rules come from the same src/pose/ modules.
 */
const aiSource = {
  id: 'ai',
  label: 'AI camera',
  hint: 'Prop the phone up so your whole body is in frame from the side, then push up. Form is checked on every rep.',
  isTapDriven: false,
  isPoseDriven: true,
  async isAvailableAsync() {
    if (Platform.OS === 'web') {
      return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
    }
    return true;
  },
  subscribe() {
    return () => {};
  },
};

export const SOURCES = [aiSource, lightSource, tapSource];

export function getSourceById(id) {
  return SOURCES.find((s) => s.id === id) || tapSource;
}

/** First source this device can actually use, preferring real hardware. */
export async function resolveDefaultSource() {
  for (const source of SOURCES) {
    if (await source.isAvailableAsync()) return source;
  }
  return tapSource;
}

/* ---------------------------------------------------------------------------
 * NATIVE_PROXIMITY — extension point
 *
 * expo-sensors has no proximity sensor, and Expo Go cannot load one. To use the
 * true proximity hardware (works on iOS too), make a development build, add a
 * proximity package, and register it as a source here:
 *
 *   npx expo install expo-dev-client react-native-proximity
 *
 *   import Proximity from 'react-native-proximity';
 *   const nativeProximitySource = {
 *     id: 'native',
 *     label: 'Proximity sensor (native)',
 *     hint: '...',
 *     isTapDriven: false,
 *     isAvailableAsync: async () => true,
 *     subscribe(onProximityChange) {
 *       const handler = ({ proximity }) => onProximityChange(proximity);
 *       Proximity.addListener(handler);
 *       Proximity.start();
 *       return () => { Proximity.stop(); Proximity.removeListener(handler); };
 *     },
 *   };
 *
 * Then put it first in SOURCES. Nothing else in the app changes — the detector,
 * the counter and persistence all consume the same near/far contract.
 * ------------------------------------------------------------------------- */
