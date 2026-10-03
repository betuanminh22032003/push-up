/**
 * How far the phone has turned since the set began, as a near/far stream.
 *
 * For the motion source (src/sensors/sources.js) the phone rides on the
 * moving part of the body — a thigh, the chest, a hand — so the limb's angle
 * is the phone's angle. Gravity is the one direction that stays fixed while the body
 * moves, so the signal is the angle between where gravity points now, in the
 * phone's own axes, and where it pointed at the start of the set:
 *
 *   baseline    taken from the first few hundred ms of samples, once the
 *               phone has held still that long (the set starts at the "go"
 *               cue, in the rest position)
 *   near        the angle reaches `nearDeg`: the bottom of a squat, the top of
 *               a sit-up, the arm overhead in a jumping jack
 *   far         back down to `farDeg` or less: the start position again
 *   in between  the state holds — hysteresis, so an angle hovering on one
 *               threshold cannot rattle and inflate the count
 *
 * Only a change of state is reported; the rep detector does the rest (a rep is
 * one near -> far cycle, with its own graze and cadence guards).
 *
 * Pure and deterministic, with every time taken from the caller: no React
 * Native or Expo imports, so the Node suite replays synthetic motion through
 * exactly this code.
 */

export const TILT_DEFAULTS = {
  /** Thresholds used when the caller passes none (or an unusable pair). */
  nearDeg: 45,
  farDeg: 20,
  /** How long the phone must hold still for its orientation to become the baseline. */
  baselineMs: 300,
  /**
   * "Still" for the baseline: every sample within this angle of the window's
   * average so far. Against the average rather than one sample, so sensor
   * noise alone cannot keep breaking the window.
   */
  stillDeg: 12,
  /**
   * Give up waiting for stillness after this long, and use the orientation
   * the phone held at first, before it first moved. Never still means the
   * exercise started at once — from the rest position the set began in, which
   * is what those first samples saw. Waiting on would count nothing for the
   * whole set; only the reps finished in this time are lost.
   */
  settleMs: 1500,
  /**
   * Time constant of the smoothing. Short on purpose: the orientation comes
   * out of the platform's sensor fusion already smooth, so this only blunts a
   * single-sample glitch (a landing jolt). A brisk jumping jack is over in
   * 0.6 s; 40 ms lags it by two frames at 60 Hz and trims its peak by about 4%.
   * Being a time constant rather than a sample count, it smooths 60 Hz input
   * and barely touches 5 Hz input, where every sample matters.
   */
  smoothingMs: 40,
  /**
   * A gap this long before the baseline exists starts the search over. On
   * Android, expo-sensors keeps the last rotation reading across
   * unsubscribe/subscribe and sends it again the moment a new subscription
   * starts: the phone in hand when the last set's Done or Pause was tapped,
   * seconds old, while the phone has since gone into the pocket. Taken as the
   * first sample of the set it became the baseline, and every set after the
   * first counted nothing. The slowest sensor rate, SENSOR_DELAY_NORMAL, is
   * about 200 ms between samples.
   */
  maxGapMs: 500,
};

/** Gravity's plausible magnitude range, in m/s², for the acceleration-difference reading. */
const MIN_GRAVITY = 4.9;
const MAX_GRAVITY = 14.7;

const DEG = 180 / Math.PI;

function isVector(v) {
  return (
    Array.isArray(v) &&
    v.length === 3 &&
    Number.isFinite(v[0]) &&
    Number.isFinite(v[1]) &&
    Number.isFinite(v[2])
  );
}

function length(v) {
  return Math.hypot(v[0], v[1], v[2]);
}

/** The unit vector along `v`, or null for anything that is not a usable direction. */
function unit(v) {
  if (!isVector(v)) return null;
  const n = length(v);
  if (!(n > 1e-9) || !Number.isFinite(n)) return null;
  return [v[0] / n, v[1] / n, v[2] / n];
}

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/**
 * Angle between two directions, in degrees (0..180); null if either is not a
 * usable vector. atan2 of the cross and dot products stays accurate near 0
 * and 180, where acos of the dot product loses precision.
 */
export function angleBetween(a, b) {
  const u = unit(a);
  const v = unit(b);
  if (!u || !v) return null;
  const cross = [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ];
  const dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  return Math.atan2(length(cross), dot) * DEG;
}

/** A sensor timestamp (seconds) as milliseconds, or null if there is none. */
function stampMs(part) {
  const s = part?.timestamp;
  return Number.isFinite(s) && s > 0 ? s * 1000 : null;
}

/**
 * Android: gravity from `rotation`.
 *
 * expo-sensors computes it from TYPE_ROTATION_VECTOR with
 * SensorManager.getOrientation(), and sends alpha = -azimuth, beta = -pitch,
 * gamma = roll, in radians. getOrientation reads pitch and roll off the
 * rotation matrix's third row, which is "up" in the phone's axes:
 * (-sin roll cos pitch, -sin pitch, cos roll cos pitch). Pitch stays within
 * ±90°, so that row — and gravity, its opposite — is recovered exactly at any
 * orientation; no gimbal lock, since only the direction is needed.
 */
function fromAndroidRotation(rotation) {
  const beta = rotation?.beta;
  const gamma = rotation?.gamma;
  if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return null;
  const cosBeta = Math.cos(beta);
  return [Math.sin(gamma) * cosBeta, -Math.sin(beta), -Math.cos(gamma) * cosBeta];
}

/**
 * Gravity as `accelerationIncludingGravity - acceleration`. On iOS both come
 * from one CMDeviceMotion sample, so the difference is CoreMotion's fused
 * gravity exactly. On Android they are separate sensor events, so it is only
 * the fallback for the first frames, before a rotation event has arrived; a
 * magnitude far from 1 g means the two did not match up, and is dropped.
 */
function fromAccelerationDifference(measurement) {
  const withGravity = measurement.accelerationIncludingGravity;
  const linear = measurement.acceleration;
  if (!withGravity || !linear) return null;
  const v = [withGravity.x - linear.x, withGravity.y - linear.y, withGravity.z - linear.z];
  if (!isVector(v)) return null;
  const n = length(v);
  return n >= MIN_GRAVITY && n <= MAX_GRAVITY ? v : null;
}

/**
 * The direction of gravity (pointing down, in the phone's axes) from one
 * DeviceMotion measurement, with the sensor's timestamp in milliseconds (null
 * if it carried none). Null for a measurement that holds no usable reading —
 * the native side sends some before every sensor has reported.
 *
 * Both readings point gravity the same way (down: z is negative with the
 * phone face up on a table), so a sample read either way compares with any
 * other.
 */
export function gravityFromMotion(measurement, platform) {
  if (!measurement || typeof measurement !== 'object') return null;
  if (platform === 'android') {
    const vector = fromAndroidRotation(measurement.rotation);
    if (vector) return { vector, timestamp: stampMs(measurement.rotation) };
  }
  const vector = fromAccelerationDifference(measurement);
  if (vector) return { vector, timestamp: stampMs(measurement.accelerationIncludingGravity) };
  return null;
}

function positive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function resolveOptions(options) {
  const { nearDeg, farDeg } = options;
  // A pair that cannot hysterese (far at or above near) would flip on every
  // sample; fall back to the defaults rather than count noise.
  const usable =
    Number.isFinite(nearDeg) &&
    Number.isFinite(farDeg) &&
    farDeg > 0 &&
    nearDeg > farDeg &&
    nearDeg <= 180;
  return {
    nearDeg: usable ? nearDeg : TILT_DEFAULTS.nearDeg,
    farDeg: usable ? farDeg : TILT_DEFAULTS.farDeg,
    baselineMs: positive(options.baselineMs, TILT_DEFAULTS.baselineMs),
    stillDeg: positive(options.stillDeg, TILT_DEFAULTS.stillDeg),
    settleMs: positive(options.settleMs, TILT_DEFAULTS.settleMs),
    smoothingMs: positive(options.smoothingMs, TILT_DEFAULTS.smoothingMs),
    maxGapMs: positive(options.maxGapMs, TILT_DEFAULTS.maxGapMs),
  };
}

/**
 * The near/far state machine over gravity directions.
 *
 * `push(vector, timeMs)` takes gravity in the phone's axes (any length) and
 * the sample's time. It returns null for a sample it ignores — not a finite
 * non-zero vector, no finite time, or not later than the last one (a repeat of
 * a stale reading) — and otherwise `{ angle, isNear, changed }`, where `angle`
 * is null until the baseline exists and `changed` is true only on the sample
 * that flipped the state.
 */
export function createTiltDetector(options = {}) {
  const opts = resolveOptions(options || {});

  let lastT;
  let smoothed;
  let baseline;
  let isNear;
  let angle;
  // Baseline search: the current still window, and the first one as the fallback.
  let firstT;
  let firstRun;
  let windowStart;
  let windowSum;

  function reset() {
    lastT = null;
    smoothed = null;
    baseline = null;
    isNear = false;
    angle = null;
    firstT = null;
    firstRun = null;
    windowStart = 0;
    windowSum = null;
  }
  reset();

  function settle(v, t) {
    if (firstT === null) firstT = t;

    // A sample that strays from the window's average restarts the window.
    const spread = windowSum ? angleBetween(v, windowSum) : null;
    if (spread === null || spread > opts.stillDeg) {
      if (windowSum && !firstRun) firstRun = windowSum;
      windowStart = t;
      windowSum = [0, 0, 0];
    }
    windowSum = add(windowSum, v);

    if (t - windowStart >= opts.baselineMs) {
      baseline = unit(windowSum);
    } else if (t - firstT >= opts.settleMs) {
      baseline = unit(firstRun) || unit(windowSum);
    }
  }

  function push(vector, timeMs) {
    const v = unit(vector);
    if (!v || !Number.isFinite(timeMs)) return null;
    if (lastT !== null && timeMs <= lastT) return null;

    const dt = lastT === null ? Infinity : timeMs - lastT;
    lastT = timeMs;
    if (!baseline && dt !== Infinity && dt > opts.maxGapMs) {
      // Whatever came before the gap is not this set's rest pose (see
      // maxGapMs): start the baseline search, and the smoothing, from here.
      firstT = null;
      firstRun = null;
      windowStart = 0;
      windowSum = null;
      smoothed = null;
    }
    if (!smoothed) {
      smoothed = v;
    } else {
      const k = 1 - Math.exp(-dt / opts.smoothingMs);
      smoothed =
        unit([
          smoothed[0] + k * (v[0] - smoothed[0]),
          smoothed[1] + k * (v[1] - smoothed[1]),
          smoothed[2] + k * (v[2] - smoothed[2]),
        ]) || v;
    }

    if (!baseline) {
      settle(smoothed, timeMs);
      return { angle: null, isNear, changed: false };
    }

    angle = angleBetween(smoothed, baseline);
    let changed = false;
    if (!isNear && angle >= opts.nearDeg) {
      isNear = true;
      changed = true;
    } else if (isNear && angle <= opts.farDeg) {
      isNear = false;
      changed = true;
    }
    return { angle, isNear, changed };
  }

  return {
    push,
    reset,
    get baseline() {
      return baseline;
    },
    get isNear() {
      return isNear;
    },
    get angle() {
      return angle;
    },
    get options() {
      return opts;
    },
  };
}

/**
 * DeviceMotion measurements in, near/far changes out: `push(measurement)`
 * returns the new state (true = near) when it changed, null otherwise.
 *
 * Time comes from the sensor's own timestamps, which also drops repeats:
 * expo-sensors on Android sends an event every frame with the latest reading
 * of each sensor, fresh or not, and below 60 Hz most of them are stale copies.
 * A platform without timestamps falls back to `now()`. The choice is made on
 * the first usable sample and kept, so two clocks are never mixed.
 */
export function createMotionTracker({ platform, now = Date.now, ...options } = {}) {
  const detector = createTiltDetector(options);
  let clock = null;

  return {
    detector,
    push(measurement) {
      const sample = gravityFromMotion(measurement, platform);
      if (!sample) return null;
      if (clock === null) clock = sample.timestamp !== null ? 'sensor' : 'wall';
      const t = clock === 'sensor' ? sample.timestamp : now();
      if (t === null) return null;
      const result = detector.push(sample.vector, t);
      return result?.changed ? result.isNear : null;
    },
  };
}
