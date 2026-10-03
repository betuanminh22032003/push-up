/**
 * Assertions for the motion source: the phone's tilt as a near/far stream, so
 * squats, sit-ups and jumping jacks count without the camera.
 *
 *   npm run verify
 *
 * No phone moves here. Each exercise is a small body model — a thigh, a
 * torso, an arm — that carries the phone through known angles over time. The
 * model gives gravity in the phone's axes, noise and landing jolts go on top,
 * and the stream is replayed through the real src/sensors/tilt.js and then
 * the real rep detector. The Android encoding of a measurement is first
 * checked against SensorManager's own math: a test built on a wrong axis
 * convention would prove nothing.
 *
 * sources.js and useRepDetector.js import React Native, Expo and React, none
 * of which Node can load, so those import lines are swapped for stand-ins (a
 * scripted DeviceMotion, a minimal hook runtime). The rest of each file is the
 * real thing, unmodified.
 */
import assert from 'node:assert/strict';
import { read, bundle, stripImport, createHarness } from './load.mjs';

// --- stand-ins for what Node cannot load -----------------------------------

/** DeviceMotion as expo-sensors exposes it, driven by the test. */
function createFakeDeviceMotion() {
  const listeners = new Set();
  return {
    listeners,
    availability: true,
    intervals: [],
    permissionCalls: 0,
    isAvailableAsync() {
      if (this.availability === 'throw') throw new Error('native module missing');
      if (this.availability === 'reject') return Promise.reject(new Error('sensor service'));
      return Promise.resolve(this.availability);
    },
    setUpdateInterval(ms) {
      this.intervals.push(ms);
    },
    addListener(fn) {
      listeners.add(fn);
      return { remove: () => listeners.delete(fn) };
    },
    getPermissionsAsync() {
      this.permissionCalls += 1;
      return Promise.resolve({ granted: false });
    },
    requestPermissionsAsync() {
      this.permissionCalls += 1;
      return Promise.resolve({ granted: false });
    },
    emit(measurement) {
      for (const fn of [...listeners]) fn(measurement);
    },
  };
}

const fakeLight = {
  isAvailableAsync: async () => true,
  setUpdateInterval() {},
  addListener: () => ({ remove() {} }),
};

/**
 * Just enough of React's hooks for one component at a time: state, refs,
 * memoised callbacks, and effects that run after render, in order, cleaning up
 * the previous run when their deps change.
 */
function createHookRuntime() {
  let slots = [];
  let cursor = 0;
  let pending = [];
  const sameDeps = (a, b) =>
    !!a && !!b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const hooks = {
    useState(initial) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: initial };
      const slot = slots[i];
      const set = (next) => {
        slot.value = typeof next === 'function' ? next(slot.value) : next;
      };
      return [slot.value, set];
    },
    useRef(initial) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { current: initial };
      return slots[i];
    },
    useCallback(fn, deps) {
      const i = cursor++;
      if (slots[i] && sameDeps(slots[i].deps, deps)) return slots[i].fn;
      slots[i] = { fn, deps };
      return fn;
    },
    useEffect(effect, deps) {
      const i = cursor++;
      const prev = slots[i];
      if (prev && sameDeps(prev.deps, deps)) return;
      const slot = { deps, cleanup: undefined, isEffect: true };
      slots[i] = slot;
      pending.push(() => {
        prev?.cleanup?.();
        slot.cleanup = effect();
      });
    },
  };
  return {
    hooks,
    render(hook, props) {
      cursor = 0;
      pending = [];
      const out = hook(props);
      for (const run of pending) run();
      return out;
    },
    unmount() {
      for (const slot of slots) if (slot?.isEffect) slot.cleanup?.();
      slots = [];
    },
  };
}

/** Replace exact import lines, failing loudly if one has changed. */
function swapImports(source, swaps) {
  let out = source;
  for (const [line, replacement] of Object.entries(swaps)) {
    assert.ok(out.includes(line), `expected import line not found: ${line}`);
    out = out.replace(line, replacement);
  }
  return out;
}

// --- load app modules ------------------------------------------------------
const deviceMotion = createFakeDeviceMotion();
const platform = { OS: 'android' };
globalThis.__sensorStubs = {
  Platform: platform,
  DeviceMotion: deviceMotion,
  LightSensor: fakeLight,
};

const runtime = createHookRuntime();
globalThis.__hooks = runtime.hooks;

const tiltSrc = read('src/sensors/tilt.js');
const tilt = await bundle(tiltSrc);
const sources = await bundle(
  tiltSrc,
  stripImport(
    swapImports(read('src/sensors/sources.js'), {
      "import { Platform } from 'react-native';": 'const { Platform } = globalThis.__sensorStubs;',
      "import { DeviceMotion, LightSensor } from 'expo-sensors';":
        'const { DeviceMotion, LightSensor } = globalThis.__sensorStubs;',
    }),
    './tilt',
  ),
);
const repDetector = await bundle(
  swapImports(read('src/hooks/useRepDetector.js'), {
    "import { useCallback, useEffect, useRef, useState } from 'react';":
      'const { useCallback, useEffect, useRef, useState } = globalThis.__hooks;',
  }),
);
const exercises = await bundle(read('src/exercises/exercises.js'));

const { TILT_DEFAULTS, angleBetween, gravityFromMotion, createTiltDetector, createMotionTracker } =
  tilt;
const { SOURCES, getSourceById, resolveDefaultSource } = sources;
const { useRepDetector, REP_DEBOUNCE_MS } = repDetector;
const { getExercise, EXERCISES } = exercises;

const SQUAT = getExercise('squat');
const SITUP = getExercise('situp');
const JACK = getExercise('jumpingjack');

const { state, group, check } = createHarness();

// --- vector maths and noise --------------------------------------------------
const rad = (deg) => (deg * Math.PI) / 180;
const G = 9.80665;
const X = [1, 0, 0];
const Y = [0, 1, 0];
const Z = [0, 0, 1];

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (v, k) => [v[0] * k, v[1] * k, v[2] * k];
const plus = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const norm = (v) => scale(v, 1 / Math.hypot(...v));
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Rotate `v` by `deg` about the unit `axis` (Rodrigues). */
function rotate(v, axis, deg) {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  const k = norm(axis);
  return plus(plus(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c)));
}

/** Small seeded PRNG, so every run replays the same noise. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand) {
  const u = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

/** Tip the direction `v` by `deg`, toward a random perpendicular. */
function tip(v, deg, rand) {
  const r = [rand() - 0.5, rand() - 0.5, rand() - 0.5];
  const perp = plus(r, scale(v, -dot(r, v)));
  if (Math.hypot(...perp) < 1e-9) return v;
  return rotate(v, cross(v, norm(perp)), deg);
}

/** A fixed random orientation: how the phone happens to sit in the pocket or hand. */
function randomMount(rand) {
  const axis = norm([rand() - 0.5, rand() - 0.5, rand() - 0.5]);
  const deg = rand() * 360;
  return (v) => rotate(v, axis, deg);
}

// --- body models -------------------------------------------------------------
// Each maps the moving segment's angle (degrees from the rest position) to
// gravity in the phone's axes, before the mount and the noise.

/** Front trouser pocket, phone upright along the thigh; hip flexion turns it about its x axis. */
const pocket = (deg) => rotate([0, -1, 0], X, -deg);
/** Flat on the chest, face up, lying on the back; the torso rises about the phone's x axis. */
const chest = (deg) => rotate([0, 0, -1], X, deg);
/**
 * In one hand, screen forward; the arm swings sideways (about the phone's z
 * axis) from hanging to overhead. `wobble` bends the wrist forward/back.
 */
const hand = (deg, wobble = 0) => rotate(rotate([0, -1, 0], Z, deg), X, wobble);

// --- motion profiles -----------------------------------------------------------

/**
 * A piecewise angle-over-time function from steps: ['hold', ms] keeps the
 * angle, ['move', to, ms] eases to a new one (cosine, as limbs accelerate).
 */
function profile(start, steps) {
  const segments = [];
  let t = 0;
  let angle = start;
  for (const [kind, a, b] of steps) {
    const to = kind === 'move' ? a : angle;
    const ms = kind === 'move' ? b : a;
    segments.push({ t0: t, t1: t + ms, from: angle, to });
    t += ms;
    angle = to;
  }
  const at = (time) => {
    const seg = segments.find((s) => time < s.t1) || segments[segments.length - 1];
    const f = Math.min(1, Math.max(0, (time - seg.t0) / (seg.t1 - seg.t0 || 1)));
    return seg.from + ((seg.to - seg.from) * (1 - Math.cos(Math.PI * f))) / 2;
  };
  return { at, durationMs: t };
}

const repeat = (n, steps) => Array.from({ length: n }, () => steps).flat();

/** Squats: stand, then n of down / pause / up / stand. */
const squats = (n, { depth = 85, restMs = 1000 } = {}) =>
  profile(0, [
    ['hold', restMs],
    ...repeat(n, [['move', depth, 900], ['hold', 200], ['move', 0, 900], ['hold', 500]]),
  ]);

/** Sit-ups: lie, then n of up / pause / down / lie. */
const situps = (n, { height = 70, restMs = 1000 } = {}) =>
  profile(0, [
    ['hold', restMs],
    ...repeat(n, [['move', height, 700], ['hold', 150], ['move', 0, 700], ['hold', 400]]),
  ]);

/** Jumping jacks: arms at the sides, then n non-stop cycles of `periodMs`. */
const jacks = (n, { top = 170, bottom = 8, periodMs = 600, restMs = 800 } = {}) =>
  profile(bottom, [
    ['hold', restMs],
    ...repeat(n, [['move', top, periodMs / 2], ['move', bottom, periodMs / 2]]),
    ['hold', 400],
  ]);

/**
 * Sample a profile like a sensor would: `hz` with timing jitter, through a
 * body model and a mount, with Gaussian noise and optional jolts.
 *
 * `spikes(t, angleNow)` returns extra degrees of error for that sample (a
 * landing), or 0. `wobble(t)` feeds the hand model's wrist bend.
 */
function sampleStream(
  shape,
  model,
  { hz = 60, jitterMs = 2, noiseDeg = 2, seed = 1, mount = (v) => v, spikes, wobble } = {},
) {
  const rand = mulberry32(seed);
  const stepMs = 1000 / hz;
  const samples = [];
  for (let k = 0; ; k++) {
    const t = k * stepMs + (rand() - 0.5) * 2 * jitterMs + jitterMs;
    if (t > shape.durationMs) break;
    const angle = shape.at(t);
    let v = mount(model(angle, wobble ? wobble(t) : 0));
    const extra = spikes ? spikes(t, angle) : 0;
    v = tip(v, noiseDeg * gaussian(rand) + extra, rand);
    samples.push({ t, vector: v, angle });
  }
  return samples;
}

/** Push samples into a fresh detector; return it and every change it reported. */
function replay(samples, options) {
  const detector = createTiltDetector(options);
  const changes = [];
  for (const s of samples) {
    const out = detector.push(s.vector, s.t);
    if (out?.changed) changes.push({ t: s.t, near: out.isNear });
  }
  return { detector, changes };
}

/** Changes must alternate near, far, near, … — anything else is a broken machine. */
function assertAlternates(changes) {
  changes.forEach((c, i) => assert.equal(c.near, i % 2 === 0, `change ${i} at ${c.t}ms`));
}

// The real rep detector, driven by a clock under the test's control.
let clock = 0;
const realNow = Date.now;

/** A non-tap source whose near/far stream the test emits by hand. */
function scriptedSource() {
  const src = {
    id: 'scripted',
    isTapDriven: false,
    subscribes: 0,
    unsubscribes: 0,
    emit: null,
    subscribe(cb) {
      src.subscribes += 1;
      src.emit = cb;
      return () => {
        src.unsubscribes += 1;
        src.emit = null;
      };
    },
  };
  return src;
}

/**
 * Feed changes through useRepDetector exactly as the workout screen does,
 * with the given rep floor, and return the reps it counted. Times are offset
 * so the first rep is not measured against a "last rep" at time zero.
 */
function countReps(changes, minRepMs) {
  const src = scriptedSource();
  let reps = 0;
  Date.now = () => clock;
  try {
    runtime.unmount();
    runtime.render(useRepDetector, {
      source: src,
      sourceConfig: null,
      active: true,
      onRep: () => (reps += 1),
      minRepMs,
    });
    for (const c of changes) {
      clock = 1e6 + c.t;
      src.emit(c.near);
    }
    runtime.unmount();
  } finally {
    Date.now = realNow;
  }
  return reps;
}

/** Everything at once: stream -> tilt -> rep detector, for one exercise. */
function countExercise(samples, exercise) {
  const { changes } = replay(samples, exercise.motion);
  assertAlternates(changes);
  return countReps(changes, exercise.minRepMs);
}

// --- measurement encodings -----------------------------------------------------

/**
 * What expo-sensors' Android DeviceMotionModule sends for a phone whose
 * rotation vector is the unit quaternion q = (w, x, y, z): the matrix of
 * SensorManager.getRotationMatrixFromVector, the angles of
 * SensorManager.getOrientation, and the sign flips of eventsToMap.
 */
function androidRotationFromQuaternion([q0, q1, q2, q3]) {
  const R = [
    1 - 2 * q2 * q2 - 2 * q3 * q3,
    2 * q1 * q2 - 2 * q3 * q0,
    2 * q1 * q3 + 2 * q2 * q0,
    2 * q1 * q2 + 2 * q3 * q0,
    1 - 2 * q1 * q1 - 2 * q3 * q3,
    2 * q2 * q3 - 2 * q1 * q0,
    2 * q1 * q3 - 2 * q2 * q0,
    2 * q2 * q3 + 2 * q1 * q0,
    1 - 2 * q1 * q1 - 2 * q2 * q2,
  ];
  const azimuth = Math.atan2(R[1], R[4]);
  const pitch = Math.asin(Math.max(-1, Math.min(1, -R[7])));
  const roll = Math.atan2(-R[6], R[8]);
  // R turns phone axes into world axes (x east, y north, z up), so world
  // "down" in phone axes is minus R's third row.
  const down = [-R[6], -R[7], -R[8]];
  return { down, rotation: { alpha: -azimuth, beta: -pitch, gamma: roll } };
}

/** The Android event for a phone with gravity along `down`, at `tSec`. */
function androidMeasurement(down, tSec) {
  const up = scale(norm(down), -1);
  return {
    rotation: {
      alpha: 0.7,
      beta: Math.asin(Math.max(-1, Math.min(1, up[1]))),
      gamma: Math.atan2(-up[0], up[2]),
      timestamp: tSec,
    },
    // Raw accelerometer and linear acceleration from two different moments
    // of a landing: their difference is not gravity, and must not be used.
    accelerationIncludingGravity: { x: 4, y: -25, z: 3, timestamp: tSec },
    acceleration: { x: -6, y: 14, z: 1, timestamp: tSec },
    interval: 16,
    orientation: 0,
  };
}

/** The iOS event: CoreMotion's gravity and user acceleration from one sample. */
function iosMeasurement(down, linear, tSec) {
  const g = scale(norm(down), G);
  const [lx, ly, lz] = linear;
  return {
    acceleration: { x: lx, y: ly, z: lz, timestamp: tSec },
    accelerationIncludingGravity: { x: lx + g[0], y: ly + g[1], z: lz + g[2], timestamp: tSec },
    // CMAttitude Euler angles, in a convention the detector must not rely on.
    rotation: { alpha: 1.1, beta: -0.4, gamma: 2.2, timestamp: tSec },
    interval: 16,
    orientation: 0,
  };
}

const sameDirection = (a, b, tolDeg = 1e-6) => {
  const angle = angleBetween(a, b);
  assert.ok(angle !== null && angle <= tolDeg, `directions differ by ${angle}°`);
};

// --- reading gravity -------------------------------------------------------------
group('sensors: reading gravity');

await check('Android rotation decodes to gravity at any orientation', () => {
  const rand = mulberry32(7);
  const special = [
    [1, 0, 0, 0], // flat, face up
    [0, 1, 0, 0], // face down
    [Math.SQRT1_2, Math.SQRT1_2, 0, 0], // upright, portrait
    [Math.SQRT1_2, -Math.SQRT1_2, 0, 0], // upside down
    [Math.SQRT1_2, 0, Math.SQRT1_2, 0], // on its side
    [0.5, 0.5, 0.5, 0.5],
  ];
  const random = Array.from({ length: 500 }, () =>
    norm4([gaussian(rand), gaussian(rand), gaussian(rand), gaussian(rand)]),
  );
  for (const q of [...special, ...random]) {
    const { down, rotation } = androidRotationFromQuaternion(q);
    const read = gravityFromMotion({ rotation: { ...rotation, timestamp: 5 } }, 'android');
    assert.ok(read, `no reading for q=${q}`);
    sameDirection(read.vector, down, 1e-6);
  }
  // Face up on a table, gravity points out of the back: -z on both platforms.
  const flat = gravityFromMotion({ rotation: { alpha: 0, beta: 0, gamma: 0 } }, 'android');
  sameDirection(flat.vector, [0, 0, -1]);
});

function norm4(q) {
  const n = Math.hypot(...q);
  return q.map((x) => x / n);
}

await check('Android prefers the fused rotation over the acceleration difference', () => {
  const down = norm([0.3, -0.8, -0.5]);
  const read = gravityFromMotion(androidMeasurement(down, 12.5), 'android');
  sameDirection(read.vector, down, 1e-9);
  assert.equal(read.timestamp, 12500, 'sensor seconds become milliseconds');
});

await check('Android falls back to the acceleration difference before any rotation', () => {
  // expo-sensors: accelerationIncludingGravity = raw - 2 * TYPE_GRAVITY, and
  // acceleration = TYPE_LINEAR_ACCELERATION = raw - TYPE_GRAVITY.
  const gravityUp = scale(norm([0.2, 0.9, 0.3]), G);
  const linear = [3, -20, 8];
  const raw = plus(linear, gravityUp);
  const withG = plus(raw, scale(gravityUp, -2));
  const m = {
    accelerationIncludingGravity: { x: withG[0], y: withG[1], z: withG[2], timestamp: 3 },
    acceleration: { x: linear[0], y: linear[1], z: linear[2], timestamp: 3 },
  };
  sameDirection(gravityFromMotion(m, 'android').vector, scale(gravityUp, -1), 1e-9);
  // A difference nowhere near 1 g is two mismatched moments, not gravity.
  const skewed = { ...m, acceleration: { x: 0, y: 30, z: 0, timestamp: 3 } };
  assert.equal(gravityFromMotion(skewed, 'android'), null);
});

await check('iOS reads CoreMotion gravity even under several g of swing', () => {
  const down = norm([-0.1, -0.95, 0.3]);
  const read = gravityFromMotion(iosMeasurement(down, [25, -40, 12], 8.25), 'ios');
  sameDirection(read.vector, down, 1e-9);
  assert.equal(read.timestamp, 8250);
  // iOS never decodes `rotation`: its Euler convention is not Android's.
  assert.equal(gravityFromMotion({ rotation: { alpha: 0, beta: 0.3, gamma: 0.1 } }, 'ios'), null);
});

await check('measurements with nothing usable read as null', () => {
  const junk = [
    null,
    undefined,
    'motion',
    42,
    {},
    { interval: 16, orientation: 0 }, // sent before any sensor has reported
    { rotation: { beta: NaN, gamma: 0 } },
    { rotation: { beta: 0.1 } },
    { rotation: null },
    { accelerationIncludingGravity: { x: NaN, y: 0, z: -9.8 }, acceleration: { x: 0, y: 0, z: 0 } },
    { accelerationIncludingGravity: { x: 0, y: 0, z: -9.8 }, acceleration: null },
    { accelerationIncludingGravity: { x: 0, y: 0, z: 0 }, acceleration: { x: 0, y: 0, z: 0 } },
  ];
  for (const m of junk) {
    assert.equal(gravityFromMotion(m, 'android'), null, JSON.stringify(m));
    assert.equal(gravityFromMotion(m, 'ios'), null, JSON.stringify(m));
  }
});

await check('angleBetween measures directions, not lengths', () => {
  assert.equal(angleBetween(X, scale(X, 9.8)), 0);
  assert.ok(Math.abs(angleBetween(X, Y) - 90) < 1e-9);
  assert.ok(Math.abs(angleBetween(X, scale(X, -1)) - 180) < 1e-9);
  assert.ok(Math.abs(angleBetween([0, -1, 0], pocket(80)) - 80) < 1e-9);
  assert.equal(angleBetween([0, 0, 0], X), null);
  assert.equal(angleBetween([NaN, 0, 0], X), null);
});

// --- the state machine ---------------------------------------------------------
group('sensors: tilt state machine');

/** Exact angles, each held for three samples 100 ms apart, with smoothing off. */
function stepThrough(angles, options = {}) {
  const detector = createTiltDetector({ nearDeg: 45, farDeg: 20, smoothingMs: 1, ...options });
  const changes = [];
  let t = 0;
  for (const angle of [0, 0, 0, 0, 0, ...angles.flatMap((a) => [a, a, a])]) {
    const out = detector.push(pocket(angle), t);
    if (out?.changed) changes.push({ angle, near: out.isNear });
    t += 100;
  }
  return changes;
}

await check('near at nearDeg, far at farDeg, and only changes are reported', () => {
  const changes = stepThrough([30, 44.5, 45.5, 30, 19.5, 30]);
  assert.deepEqual(changes, [
    { angle: 45.5, near: true },
    { angle: 19.5, near: false },
  ]);
});

await check('between the thresholds the state holds, both ways', () => {
  // Hovering below near never fires; hovering above far never releases.
  assert.deepEqual(stepThrough([25, 40, 25, 44, 30, 44, 21]), []);
  const changes = stepThrough([80, 40, 21, 30, 44, 25, 21, 19]);
  assert.deepEqual(changes, [
    { angle: 80, near: true },
    { angle: 19, near: false },
  ]);
});

await check('nothing is reported before the baseline, and it comes from rest', () => {
  const detector = createTiltDetector(SQUAT.motion);
  const rest = norm([0.2, -0.9, 0.35]);
  // Before baselineMs of stillness: no angle, no state.
  for (let t = 0; t < TILT_DEFAULTS.baselineMs; t += 20) {
    const out = detector.push(rest, t);
    assert.equal(out.angle, null);
    assert.equal(out.changed, false);
  }
  assert.equal(detector.baseline, null);
  detector.push(rest, TILT_DEFAULTS.baselineMs);
  sameDirection(detector.baseline, rest, 1e-6);
  const out = detector.push(rest, TILT_DEFAULTS.baselineMs + 20);
  assert.ok(out.angle < 1e-6);
});

await check('unusable thresholds fall back to the defaults instead of rattling', () => {
  const unusable = [
    { nearDeg: 20, farDeg: 45 },
    { nearDeg: 30, farDeg: 30 },
    { nearDeg: NaN },
    null,
  ];
  for (const bad of unusable) {
    const opts = createTiltDetector(bad).options;
    assert.equal(opts.nearDeg, TILT_DEFAULTS.nearDeg, JSON.stringify(bad));
    assert.equal(opts.farDeg, TILT_DEFAULTS.farDeg);
  }
  assert.equal(createTiltDetector(JACK.motion).options.nearDeg, 100);
});

await check('NaN, missing and out-of-order samples are ignored', () => {
  const clean = sampleStream(squats(5), pocket, { seed: 3 });
  const dirty = [];
  const junk = [[NaN, 0, 0], [0, 0, 0], null, undefined, [1, 2], 'x', [Infinity, 0, -1]];
  clean.forEach((s, i) => {
    dirty.push(s);
    if (i % 4 === 0) dirty.push({ t: s.t + 1, vector: junk[i % junk.length] });
    if (i % 9 === 0) dirty.push({ t: NaN, vector: s.vector });
    if (i % 11 === 0) dirty.push({ t: s.t - 50, vector: scale(s.vector, -1) }); // late, upside down
    if (i % 13 === 0) dirty.push({ t: s.t, vector: X }); // same time again
  });
  const a = replay(clean, SQUAT.motion).changes;
  const b = replay(dirty, SQUAT.motion).changes;
  assert.equal(a.length, 10);
  assert.deepEqual(b, a);
});

// --- exercises -------------------------------------------------------------------
group('sensors: squats, sit-ups, jumping jacks');

await check('pocket squats count one each, however the phone sits', () => {
  const rand = mulberry32(11);
  for (let seed = 1; seed <= 12; seed++) {
    const samples = sampleStream(squats(8), pocket, { seed, mount: randomMount(rand) });
    assert.equal(countExercise(samples, SQUAT), 8, `seed ${seed}`);
  }
});

await check('a half squat counts; a quarter squat does not', () => {
  const deep = (depth) => sampleStream(squats(6, { depth }), pocket, { seed: 4 });
  assert.equal(countExercise(deep(55), SQUAT), 6);
  assert.equal(countExercise(deep(35), SQUAT), 0);
});

await check('sit-ups with the phone on the chest count, breathing and all', () => {
  const rand = mulberry32(12);
  for (let seed = 1; seed <= 12; seed++) {
    const samples = sampleStream(situps(8), (deg, breath) => chest(deg + breath), {
      seed,
      noiseDeg: 1.5,
      mount: randomMount(rand),
      wobble: (t) => 3 * Math.sin((2 * Math.PI * t) / 4000), // the chest rising with each breath
    });
    assert.equal(countExercise(samples, SITUP), 8, `seed ${seed}`);
  }
});

await check('a crunch that never sits up does not count', () => {
  const samples = sampleStream(situps(6, { height: 30 }), chest, { seed: 5, noiseDeg: 1.5 });
  assert.equal(countExercise(samples, SITUP), 0);
});

/** Landing jolts: a burst of error at both turnarounds of every jack. */
const landings = (periodMs, restMs, deg) => (t) => {
  const phase = (t - restMs) % (periodMs / 2);
  return t > restMs && phase < 35 ? deg : 0;
};

await check('hand-held jumping jacks count through heavy noise and landing jolts', () => {
  const rand = mulberry32(13);
  for (let seed = 1; seed <= 20; seed++) {
    const samples = sampleStream(jacks(12), hand, {
      seed,
      noiseDeg: 6,
      jitterMs: 4,
      mount: randomMount(rand),
      spikes: landings(600, 800, 40),
      // The wrist bends to and fro while the arm swings.
      wobble: (t) => (t > 800 ? 12 * Math.sin((2 * Math.PI * t) / 900) : 0),
    });
    assert.equal(countExercise(samples, JACK), 12, `seed ${seed}`);
  }
});

await check('arms only to shoulder height is not a jumping jack', () => {
  const samples = sampleStream(jacks(10, { top: 80 }), hand, { seed: 6, noiseDeg: 4 });
  assert.equal(countExercise(samples, JACK), 0);
});

await check('at SENSOR_DELAY_NORMAL (~5 Hz) squats and steady jacks still count', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const slowSquats = sampleStream(squats(8), pocket, { hz: 5, jitterMs: 20, seed });
    assert.equal(countExercise(slowSquats, SQUAT), 8, `squats, seed ${seed}`);
    const slowJacks = sampleStream(jacks(10, { periodMs: 800 }), hand, {
      hz: 5,
      jitterMs: 20,
      noiseDeg: 4,
      seed,
    });
    assert.equal(countExercise(slowJacks, JACK), 10, `jacks, seed ${seed}`);
  }
});

await check('brisk jacks read off a raw accelerometer would not count', () => {
  // Why the source uses fused gravity: specific force in the hand, for an arm
  // of 0.65 m swinging about the shoulder at 0.6 s a jack, clipped at the
  // usual ±8 g. Centripetal force along the arm swamps gravity.
  const shape = jacks(12);
  const r = 0.65;
  const pos = (t) => {
    const th = rad(shape.at(t));
    return [r * Math.sin(th), -r * Math.cos(th), 0];
  };
  const samples = [];
  for (let t = 0; t <= shape.durationMs; t += 1000 / 60) {
    const h = 1;
    const p0 = pos(t - h);
    const p1 = pos(t);
    const p2 = pos(t + h);
    const accel = [0, 1, 2].map((i) => ((p2[i] - 2 * p1[i] + p0[i]) / (h * h)) * 1e6);
    const specific = plus(accel, [0, G, 0]);
    const inPhone = rotate(specific, Z, -shape.at(t)).map((x) =>
      Math.max(-8 * G, Math.min(8 * G, x)),
    );
    samples.push({ t, vector: scale(inPhone, -1) });
  }
  const counted = countExercise(samples, JACK);
  assert.ok(counted < 6, `a raw accelerometer counted ${counted} of 12`);
});

// --- baseline ----------------------------------------------------------------------
group('sensors: baseline');

await check('the baseline is the rest pose, whatever way the phone sits', () => {
  const rand = mulberry32(21);
  for (let i = 0; i < 6; i++) {
    const mount = randomMount(rand);
    const samples = sampleStream(squats(3), pocket, { seed: i + 1, mount });
    const { detector } = replay(samples, SQUAT.motion);
    sameDirection(detector.baseline, mount(pocket(0)), 2);
  }
});

await check('a phone still settling at "go" is waited for', () => {
  // 900 ms of being slipped from the hand into the pocket, then standing
  // still, then squats.
  const settling = profile(70, [['move', 120, 300], ['move', 40, 300], ['move', 0, 300]]);
  const intoPocket = (deg) => rotate(pocket(0), [1, 1, 0], deg);
  const samples = [
    ...sampleStream(settling, intoPocket, { seed: 8 }),
    ...sampleStream(squats(6), pocket, { seed: 9 }).map((s) => ({
      ...s,
      t: s.t + settling.durationMs + 1,
    })),
  ];
  const { detector, changes } = replay(samples, SQUAT.motion);
  // Within a few degrees: the window may open on the last of the slow-down.
  sameDirection(detector.baseline, pocket(0), 5);
  assert.ok(changes[0].t > settling.durationMs + 1000, 'no change before the first squat');
  assert.equal(countReps(changes, SQUAT.minRepMs), 6);
});

await check('a set started at once is measured from the pose at "go"', () => {
  // Jumping from the first moment: never still, so after settleMs the first
  // window is used. Only reps finished before then can be lost.
  const samples = sampleStream(jacks(12, { restMs: 30 }), hand, { seed: 9, noiseDeg: 4 });
  const { detector, changes } = replay(samples, JACK.motion);
  assert.ok(angleBetween(detector.baseline, hand(8)) < 15, 'baseline near arms-down');
  const counted = countReps(changes, JACK.minRepMs);
  const lost = Math.ceil(TILT_DEFAULTS.settleMs / 600);
  assert.ok(counted >= 12 - lost && counted <= 12, `counted ${counted} of 12`);
});

/** Android events through a motion tracker, as the source feeds it; returns the changes. */
function trackAndroid(samples, exercise) {
  const tracker = createMotionTracker({ platform: 'android', ...exercise.motion });
  const changes = [];
  for (const s of samples) {
    const near = tracker.push(androidMeasurement(s.vector, 5000 + s.t / 1000));
    if (near !== null) changes.push({ t: s.t, near });
  }
  return { tracker, changes };
}

await check('a stale reading from the last set does not become the next baseline', () => {
  // expo-sensors on Android re-sends its last rotation reading the moment a
  // new subscription starts: the phone in hand as Done or Pause was tapped,
  // seconds before it went back into the pocket for this set.
  const inHand = rotate(pocket(0), X, 50);
  for (const staleMs of [3000, 30000]) {
    for (const flip of [false, true]) {
      const mount = flip ? (v) => [-v[0], -v[1], v[2]] : (v) => v;
      const set = sampleStream(squats(5, { depth: 80 }), pocket, { hz: 50, seed: 13, mount });
      const samples = [{ t: -staleMs, vector: mount(inHand) }, ...set];
      const { tracker, changes } = trackAndroid(samples, SQUAT);
      sameDirection(tracker.detector.baseline, mount(pocket(0)), 3);
      assertAlternates(changes);
      assert.equal(countReps(changes, SQUAT.minRepMs), 5, `stale ${staleMs}ms, flipped ${flip}`);
    }
  }
});

await check('a slow sensor, 300 ms between samples, still settles at once', () => {
  const samples = sampleStream(squats(4), pocket, { hz: 1000 / 300, jitterMs: 0, seed: 14 });
  const { detector, changes } = replay(samples, SQUAT.motion);
  sameDirection(detector.baseline, pocket(0), 5);
  assert.ok(changes.length > 0 && changes[0].t > 1000, 'baseline before the first squat');
  assert.equal(countReps(changes, SQUAT.minRepMs), 4);
});

// --- the source object ---------------------------------------------------------------
group('sensors: motion source');

const motion = getSourceById('motion');

/** Emit an exercise's stream as Android (or iOS) DeviceMotion events, frame by frame. */
function emitStream(samples, os, { repeats = 1 } = {}) {
  for (const s of samples) {
    const tSec = 5000 + s.t / 1000;
    const m =
      os === 'android'
        ? androidMeasurement(s.vector, tSec)
        : iosMeasurement(s.vector, [12, -30, 4], tSec);
    // Android re-sends the last reading every frame until a new one arrives.
    for (let k = 0; k < repeats; k++) deviceMotion.emit(m);
  }
}

await check('it is registered per the contract, between light and tap', () => {
  assert.deepEqual(SOURCES.map((s) => s.id), ['ai', 'light', 'motion', 'tap', 'timer']);
  assert.equal(motion.id, 'motion');
  assert.equal(motion.labelKey, 'source.motion');
  assert.equal(motion.hintKey, 'source.motion.hint');
  assert.equal(motion.isTapDriven, false);
  assert.equal(typeof motion.subscribe, 'function');
  assert.equal(motion.calibrateAsync, undefined, 'the baseline is taken at subscribe');
  assert.equal(getSourceById('nope').id, 'tap');
});

await check('the timer source is a stopwatch for holds: always there, no stream', async () => {
  const timer = getSourceById('timer');
  assert.equal(timer.isTimerDriven, true);
  assert.equal(timer.isTapDriven, false);
  assert.equal(await timer.isAvailableAsync(), true);
  const off = timer.subscribe(() => assert.fail('a stopwatch emits no near/far'));
  assert.equal(typeof off, 'function');
  off();
  // Rep exercises never fall back to it, nor holds to tapping.
  for (const e of EXERCISES) assert.equal(e.sources.includes('timer'), e.kind === 'hold', e.id);
});

await check('every exercise source exists, and every motion exercise has usable angles', () => {
  const ids = SOURCES.map((s) => s.id);
  for (const e of EXERCISES) {
    for (const id of e.sources) assert.ok(ids.includes(id), `${e.id}: ${id}`);
    if (e.sources.includes('motion')) {
      assert.ok(e.motion && e.motion.nearDeg > e.motion.farDeg, `${e.id} motion angles`);
      assert.deepEqual(createTiltDetector(e.motion).options.nearDeg, e.motion.nearDeg);
    }
  }
});

await check('available where DeviceMotion is, never on web, false on any error', async () => {
  platform.OS = 'android';
  deviceMotion.availability = true;
  assert.equal(await motion.isAvailableAsync(), true);
  deviceMotion.availability = false;
  assert.equal(await motion.isAvailableAsync(), false, 'no gyroscope');
  deviceMotion.availability = 'throw';
  assert.equal(await motion.isAvailableAsync(), false);
  deviceMotion.availability = 'reject';
  assert.equal(await motion.isAvailableAsync(), false);
  deviceMotion.availability = true;
  platform.OS = 'ios';
  assert.equal(await motion.isAvailableAsync(), true);
  platform.OS = 'web';
  assert.equal(await motion.isAvailableAsync(), false);
  platform.OS = 'android';
  assert.equal(deviceMotion.permissionCalls, 0, 'never asks for a permission');
});

await check('subscribe counts Android squats, with stale repeats, and unsubscribes cleanly', () => {
  platform.OS = 'android';
  const seen = [];
  const unsubscribe = motion.subscribe((near) => seen.push(near), SQUAT.motion);
  assert.equal(deviceMotion.listeners.size, 1);
  assert.ok(deviceMotion.intervals.at(-1) <= 50, 'asks for a rate fast enough for a jack');
  emitStream(sampleStream(squats(5), pocket, { seed: 2, hz: 30 }), 'android', { repeats: 2 });
  assert.deepEqual(seen, [true, false, true, false, true, false, true, false, true, false]);
  unsubscribe();
  assert.equal(deviceMotion.listeners.size, 0);
  emitStream(sampleStream(squats(1), pocket, { seed: 2 }), 'android');
  assert.equal(seen.length, 10, 'nothing after unsubscribe');
  assert.equal(deviceMotion.permissionCalls, 0);
});

await check('subscribe counts iOS jumping jacks from CoreMotion gravity', () => {
  platform.OS = 'ios';
  const seen = [];
  const unsubscribe = motion.subscribe((near) => seen.push(near), JACK.motion);
  emitStream(sampleStream(jacks(6), hand, { seed: 3, noiseDeg: 4 }), 'ios');
  unsubscribe();
  platform.OS = 'android';
  assert.equal(seen.filter((near) => !near).length, 6);
  assertAlternates(seen.map((near) => ({ near })));
});

await check('the exercise angles decide what counts; no config means the defaults', () => {
  const run = (config) => {
    const seen = [];
    const unsubscribe = motion.subscribe((near) => seen.push(near), config);
    emitStream(sampleStream(squats(3), pocket, { seed: 4 }), 'android');
    unsubscribe();
    return seen.length;
  };
  assert.equal(run(SQUAT.motion), 6);
  assert.equal(run(JACK.motion), 0, 'an 85° squat is not a 100° jack');
  assert.equal(run(null), 6);
  assert.equal(run(undefined), 6);
});

await check('the tracker reports changes only, on sensor time', () => {
  const tracker = createMotionTracker({ ...SQUAT.motion, platform: 'android', now: () => 0 });
  const outputs = sampleStream(squats(2), pocket, { seed: 5 }).map((s) =>
    tracker.push(androidMeasurement(s.vector, 100 + s.t / 1000)),
  );
  assert.deepEqual(outputs.filter((o) => o !== null), [true, false, true, false]);
  // Without sensor timestamps it runs on the wall clock instead.
  let wall = 0;
  const untimed = createMotionTracker({ ...SQUAT.motion, platform: 'ios', now: () => wall });
  const changes = [];
  for (const s of sampleStream(squats(2), pocket, { seed: 5 })) {
    wall = s.t;
    const m = iosMeasurement(s.vector, [0, 0, 0], 0);
    delete m.accelerationIncludingGravity.timestamp;
    const out = untimed.push(m);
    if (out !== null) changes.push(out);
  }
  assert.deepEqual(changes, [true, false, true, false]);
});

await check('resolveDefaultSource keeps the push-up default; ids narrow it', async () => {
  platform.OS = 'android';
  deviceMotion.availability = true;
  assert.equal((await resolveDefaultSource()).id, 'ai');
  assert.equal((await resolveDefaultSource(SQUAT.sources)).id, 'ai');
  assert.equal((await resolveDefaultSource(['motion', 'tap'])).id, 'motion');
  deviceMotion.availability = false;
  assert.equal((await resolveDefaultSource(['motion', 'tap'])).id, 'tap');
  platform.OS = 'web'; // no camera API in Node: as a browser without getUserMedia
  assert.equal((await resolveDefaultSource()).id, 'tap');
  platform.OS = 'android';
  deviceMotion.availability = true;
});

// --- rep detector ------------------------------------------------------------------
group('sensors: rep detector floor');

/** Render the hook once with `props`, then play [time, near] pairs through it. */
function mountDetector(props) {
  const src = scriptedSource();
  let reps = 0;
  const all = { source: src, sourceConfig: SQUAT.motion, active: true, ...props };
  const render = (extra = {}) =>
    runtime.render(useRepDetector, { onRep: () => (reps += 1), ...all, ...extra });
  runtime.unmount();
  render();
  const play = (pairs) => {
    Date.now = () => clock;
    try {
      for (const [t, near] of pairs) {
        clock = 1e6 + t;
        src.emit(near);
      }
    } finally {
      Date.now = realNow;
    }
    return reps;
  };
  return { src, render, play };
}

await check('the default floor is still 500 ms', () => {
  assert.equal(REP_DEBOUNCE_MS, 500);
  const d = mountDetector({});
  assert.equal(d.play([[0, true], [150, false]]), 1);
  assert.equal(d.play([[300, true], [550, false]]), 1, '400 ms after the last rep');
  assert.equal(d.play([[500, true], [650, false]]), 2, '500 ms after it');
});

await check('minRepMs lowers the floor for a faster exercise', () => {
  const d = mountDetector({ minRepMs: 350 });
  assert.equal(d.play([[0, true], [150, false], [300, true], [500, false]]), 2);
  assert.equal(d.play([[600, true], [800, false]]), 2, '300 ms is still too soon');
});

await check('a new minRepMs applies at once and never resubscribes', () => {
  const d = mountDetector({ minRepMs: 350 });
  assert.equal(d.play([[0, true], [150, false]]), 1);
  d.render({ minRepMs: 500, onRep: () => {} }); // also a new onRep identity
  d.render({ minRepMs: 500 });
  assert.equal(d.src.subscribes, 1);
  assert.equal(d.src.unsubscribes, 0);
  assert.equal(d.play([[300, true], [550, false]]), 1, '400 ms is too soon at 500');
  assert.equal(d.play([[700, true], [1100, false]]), 2);
});

await check('an unusable minRepMs falls back to the default', () => {
  for (const bad of [NaN, -5, '300', null]) {
    const d = mountDetector({ minRepMs: bad });
    assert.equal(d.play([[0, true], [150, false], [300, true], [550, false]]), 1, String(bad));
  }
});

await check('the 80 ms graze guard is unchanged', () => {
  const d = mountDetector({ minRepMs: 350 });
  assert.equal(d.play([[0, true], [50, false]]), 0);
  assert.equal(d.play([[400, true], [490, false]]), 1);
});

runtime.unmount();
console.log(`\n${state.passed} passed, ${state.failed} failed`);
process.exit(state.failed === 0 ? 0 : 1);
