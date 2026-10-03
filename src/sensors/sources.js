import { Platform } from 'react-native';
import { DeviceMotion, LightSensor } from 'expo-sensors';
import { createMotionTracker } from './tilt';

/**
 * Detection sources.
 *
 * A "source" converts some hardware/user signal into a stream of boolean
 * near/far states and hands them to `onProximityChange(isNear)`: near is the
 * bottom of a rep, far is back at the start. The rep detector
 * (src/hooks/useRepDetector.js) is the only consumer and knows nothing about
 * which source it is fed by — so adding a driver later is a change to this
 * file alone.
 *
 *   light   push-ups: the chest covering the sensor, a proximity stand-in
 *   tap     anything: the screen itself, touched at the bottom of each rep
 *   motion  squats, sit-ups, jumping jacks: how far the phone, carried by the
 *           moving limb, has turned since the set began
 *   ai      the camera; reports finished reps itself instead of near/far
 *
 * Which sources suit which exercise is src/exercises/exercises.js's call; the
 * motion source takes its angles from there through `subscribe`'s config.
 *
 * Contract every source implements:
 *   id                 stable key persisted in settings
 *   labelKey / hintKey translation keys for the UI copy
 *   isTapDriven        true => the screen surface acts as the sensor
 *   isAvailableAsync() can this device use it right now?
 *   calibrateAsync()   optional; returns { ok, messageKey, messageParams, ...config }
 *   settleSeconds      optional; the source measures from where the phone is
 *                      when counting starts, so the workout always counts down
 *                      at least this long first (before resuming too), giving
 *                      the user time to put the phone in place
 *   subscribe(cb, cfg) returns an unsubscribe function
 *
 * NOTE ON expo-sensors: it ships Accelerometer, Barometer, DeviceMotion,
 * Gyroscope, LightSensor, Magnetometer(+Uncalibrated) and Pedometer — there is
 * no proximity sensor. On Android the ambient light sensor sits in the same
 * earpiece cutout as the proximity sensor, so covering it is a faithful and
 * fully working stand-in for push-ups. iOS exposes no light sensor to JS, so
 * iOS uses the tap source until a native proximity module is added (see
 * NATIVE_PROXIMITY at the bottom of this file).
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
  labelKey: 'source.light',
  hintKey: 'source.light.hint',
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
      return { ok: false, messageKey: 'notice.noLight' };
    }

    const baseline = median(samples);
    if (baseline < MIN_USABLE_BASELINE_LUX) {
      return {
        ok: false,
        baseline,
        messageKey: 'notice.tooDark',
        messageParams: { lux: Math.round(baseline) },
      };
    }

    return {
      ok: true,
      baseline,
      nearThreshold: Math.max(baseline * 0.15, 2),
      farThreshold: Math.max(baseline * 0.4, 6),
      messageKey: 'notice.calibrated',
      messageParams: { lux: Math.round(baseline) },
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
 * Motion source: the phone rides on the limb that moves — in a front trouser
 * pocket for squats, flat on the chest for sit-ups, in one hand for jumping
 * jacks — and the signal is how far it has turned from where it was when the
 * set began. The rule (angles, baseline, hysteresis) lives in ./tilt, pure, so
 * the Node suite replays synthetic squats and jacks through it.
 *
 * WHY DeviceMotion AND NOT THE ACCELEROMETER. The accelerometer measures
 * gravity plus every other acceleration, and only a still phone reads gravity
 * alone. In a pocket squat the rest is small, but a hand-held jumping jack
 * swings the phone on a 0.6-0.7 m arm at around 10 rad/s: several g of
 * centripetal force, along the arm toward the shoulder — the very direction
 * the accelerometer reads with the arm hanging at rest — plus a jolt at every
 * landing. At that pace, for most of the swing the reading points along the
 * arm whichever way the arm points, and a filter slow enough to average it away
 * would average away a 0.6 s rep with it. DeviceMotion fuses in the
 * gyroscope, which measures the turning itself and feels no centripetal
 * force; the accelerometer only corrects slow drift (AOSP's fusion, for one,
 * trusts a reading less the further its magnitude is from 1 g).
 *
 * WHICH FIELD. Read in ./tilt's gravityFromMotion:
 *   Android  `rotation`, from TYPE_ROTATION_VECTOR: one fused event, from
 *            which gravity in the phone's axes is exact. Not
 *            `accelerationIncludingGravity - acceleration`: expo-sensors
 *            builds those from separate sensor events (raw accelerometer
 *            minus twice TYPE_GRAVITY, and TYPE_LINEAR_ACCELERATION), so
 *            during a landing their difference mixes two different moments.
 *   iOS      that difference: both come from one CMDeviceMotion sample, and
 *            it is CoreMotion's fused gravity exactly.
 *
 * AVAILABILITY. On Android expo-sensors reports DeviceMotion available only
 * with a gyroscope, rotation vector, gravity and linear acceleration sensor.
 * Budget phones without a gyroscope get `false`, and those exercises fall
 * back to the camera or tap: the accelerometer is all such a phone has, and
 * it would miscount jumping jacks rather than count none. Web: never — mobile
 * browsers hide motion behind a prompt that only a tap may raise, and the web
 * build is a preview, not where anyone works out.
 *
 * NO PERMISSION. Reading motion needs none on either platform. The
 * DeviceMotion permission methods are deliberately never called: on Android
 * they ask for ACTIVITY_RECOGNITION (step counting, blocked in app.json), and
 * on iOS they are CMPedometer's motion & fitness access, which device motion
 * does not use.
 *
 * SAMPLE RATE. Without HIGH_SAMPLING_RATE_SENSORS in the manifest,
 * expo-sensors registers the Android sensors at SENSOR_DELAY_NORMAL, about
 * 5 Hz. Expo Go declares it; a build needs it in app.json's permissions. The
 * smoothing in ./tilt is a time constant, so 5 Hz still counts, but a brisk
 * 0.6 s jumping jack is then only three samples.
 *
 * BASELINE. The rest position is whatever the phone sees when `subscribe` is
 * called — the rep detector subscribes when a set goes active, at the "go"
 * cue — and ./tilt waits for the phone to hold still before taking it.
 * Android stops the sensors whenever the app leaves the foreground, screen off
 * included, so the phone must stay unlocked (the workout keeps it awake).
 */
const MOTION_INTERVAL_MS = 20;

const motionSource = {
  id: 'motion',
  labelKey: 'source.motion',
  hintKey: 'source.motion.hint',
  isTapDriven: false,
  // Start and Resume are pressed with the phone in hand; it has to be back in
  // the pocket (or on the chest) before the baseline is taken, and ./tilt only
  // waits 1.5 s for it to hold still.
  settleSeconds: 3,

  async isAvailableAsync() {
    if (Platform.OS === 'web') return false;
    try {
      return await DeviceMotion.isAvailableAsync();
    } catch {
      return false;
    }
  },

  /**
   * `config` is the exercise's `motion` entry: `{ nearDeg, farDeg }`. Pass the
   * same object every time — the rep detector resubscribes on a new one, and
   * every subscription takes a fresh baseline.
   */
  subscribe(onProximityChange, config) {
    const tracker = createMotionTracker({
      nearDeg: config?.nearDeg,
      farDeg: config?.farDeg,
      platform: Platform.OS,
    });

    try {
      DeviceMotion.setUpdateInterval(MOTION_INTERVAL_MS);
    } catch {
      // The platform's own rate is still usable.
    }
    const subscription = DeviceMotion.addListener((measurement) => {
      const change = tracker.push(measurement);
      if (change !== null) onProximityChange(change);
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
  labelKey: 'source.tap',
  hintKey: 'source.tap.hint',
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
  labelKey: 'source.ai',
  hintKey: 'source.ai.hint',
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

export const SOURCES = [aiSource, lightSource, motionSource, tapSource];

export function getSourceById(id) {
  return SOURCES.find((s) => s.id === id) || tapSource;
}

/**
 * First source this device can actually use, preferring real hardware.
 * `allowedIds` (optional, e.g. an exercise's `sources`) limits the choice;
 * the order of preference stays SOURCES', and tap is the last resort.
 */
export async function resolveDefaultSource(allowedIds) {
  for (const source of SOURCES) {
    if (Array.isArray(allowedIds) && !allowedIds.includes(source.id)) continue;
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
 *     labelKey: 'source.native',
 *     hintKey: 'source.native.hint',
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
