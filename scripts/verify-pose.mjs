/**
 * Assertions for pose-based rep counting: push-ups, squats, sit-ups and
 * jumping jacks.
 *
 * Skeletons are synthesised with exact known angles, so a rep can be replayed
 * frame by frame with no camera and no model. The builders are self-checked
 * against the geometry code first — a test built on a wrong skeleton would
 * prove nothing.
 */
import assert from 'node:assert/strict';
import { read, bundle, createHarness } from './load.mjs';

/**
 * The pose modules, concatenated in the order the page inlines them, so a name
 * declared in two of them fails here exactly as it would on the phone. Local
 * imports and re-exports are dropped: concatenation supplies those names.
 */
const POSE_MODULES = [
  'geometry',
  'landmarks',
  'repEngine',
  'readings',
  'pushupAnalyzer',
  'squatAnalyzer',
  'situpAnalyzer',
  'jumpingJackAnalyzer',
  'upperBodyAnalyzers',
  'lowerBodyAnalyzers',
  'coreAnalyzers',
  'holdAnalyzers',
  'analyzers',
];
const unwrap = (source) =>
  source
    .replace(/^import[\s\S]*?from\s+'[^']+';\s*$/gm, '')
    .replace(/^export\s*\{[^}]*\};?\s*$/gm, '');
const pose = await bundle(...POSE_MODULES.map((name) => unwrap(read(`src/pose/${name}.js`))));
const exercises = await bundle(read('src/exercises/exercises.js'));

const { createPushupAnalyzer, measureFrame, ISSUES, DEFAULTS } = pose;
const { fromMediaPipe, fromMoveNet, JOINTS } = pose;
const {
  createAnalyzer,
  POSE_EXERCISE_IDS,
  POSE_DEFAULTS,
  POSE_HOLD_IDS,
  measureSquatFrame,
  measureSitupFrame,
  measureJumpingJackFrame,
} = pose;

const { state, group, check } = createHarness();
const rad = (deg) => (deg * Math.PI) / 180;

// --- synthetic skeleton ----------------------------------------------------
const LIMB = 0.12;
const TORSO = 0.27;
const THIGH = 0.22;

/**
 * Build a side-on skeleton with the requested elbow angle, body angle
 * (shoulder-hip-knee) and torso tilt from horizontal. Left and right are
 * identical, as they nearly are when a push-up is filmed from the side.
 */
function makePose({ elbow = 175, body = 178, tilt = 4, visibility = 1 } = {}) {
  const shoulder = { x: 0.35, y: 0.45 };
  const hip = {
    x: shoulder.x + TORSO * Math.cos(rad(tilt)),
    y: shoulder.y + TORSO * Math.sin(rad(tilt)),
  };

  // Place the knee so the interior angle at the hip is exactly `body`.
  const towardShoulder = Math.atan2(shoulder.y - hip.y, shoulder.x - hip.x);
  const kneeDir = towardShoulder + rad(body);
  const knee = { x: hip.x + THIGH * Math.cos(kneeDir), y: hip.y + THIGH * Math.sin(kneeDir) };
  const ankle = { x: knee.x + THIGH * Math.cos(kneeDir), y: knee.y + THIGH * Math.sin(kneeDir) };

  // Elbow sits directly below the shoulder; the wrist is swung to realise the
  // requested interior angle at the elbow.
  const elbowPt = { x: shoulder.x, y: shoulder.y + LIMB };
  const phi = Math.asin(-Math.cos(rad(elbow)));
  const wrist = { x: elbowPt.x + LIMB * Math.cos(phi), y: elbowPt.y + LIMB * Math.sin(phi) };

  const tag = (p) => ({ x: p.x, y: p.y, score: visibility });
  return {
    nose: tag({ x: shoulder.x - 0.05, y: shoulder.y - 0.03 }),
    leftShoulder: tag(shoulder),
    rightShoulder: tag(shoulder),
    leftElbow: tag(elbowPt),
    rightElbow: tag(elbowPt),
    leftWrist: tag(wrist),
    rightWrist: tag(wrist),
    leftHip: tag(hip),
    rightHip: tag(hip),
    leftKnee: tag(knee),
    rightKnee: tag(knee),
    leftAnkle: tag(ankle),
    rightAnkle: tag(ankle),
  };
}

// --- frame sequencing ------------------------------------------------------
const FPS = 30;
const STEP = Math.round(1000 / FPS);

/** Hold an angle for `ms`. */
function hold(ms, opts) {
  const out = [];
  for (let t = 0; t < ms; t += STEP) out.push({ ...opts });
  return out;
}

/** Linearly sweep the elbow angle from `from` to `to` over `ms`. */
function ramp(from, to, ms, opts = {}) {
  const out = [];
  const steps = Math.max(1, Math.round(ms / STEP));
  for (let i = 1; i <= steps; i++) {
    out.push({ ...opts, elbow: from + ((to - from) * i) / steps });
  }
  return out;
}

/** One complete push-up: settle at the top, descend, pause, press back up. */
function cycle(opts = {}) {
  const { top = 172, bottom = 85, downMs = 400, upMs = 400, pauseMs = 180, ...rest } = opts;
  return [
    ...hold(200, { elbow: top, ...rest }),
    ...ramp(top, bottom, downMs, rest),
    ...hold(pauseMs, { elbow: bottom, ...rest }),
    ...ramp(bottom, top, upMs, rest),
    ...hold(200, { elbow: top, ...rest }),
  ];
}

/** Feed frames to an analyser, returning the reps and every emitted event. */
function run(analyzer, frames, startAt = 0) {
  let t = startAt;
  const events = [];
  for (const frame of frames) {
    const out = analyzer.push(makePose(frame), t);
    if (out.repCompleted || out.partialRep || out.issues.length) {
      events.push({ t, ...out });
    }
    t += STEP;
  }
  return { reps: analyzer.reps, events, endedAt: t };
}

const issuesIn = (events) => [...new Set(events.flatMap((e) => e.issues))];

// --- skeleton builder self-check -------------------------------------------
group('pose: synthetic skeleton');

await check('builder produces the elbow angle it was asked for', () => {
  for (const target of [60, 90, 120, 150, 175]) {
    const m = measureFrame(makePose({ elbow: target }));
    assert.ok(Math.abs(m.elbow - target) < 0.5, `elbow ${target} measured ${m.elbow}`);
  }
});

await check('builder produces the body angle it was asked for', () => {
  for (const target of [120, 150, 178]) {
    const m = measureFrame(makePose({ body: target }));
    assert.ok(Math.abs(m.body - target) < 0.5, `body ${target} measured ${m.body}`);
  }
});

await check('builder produces the torso tilt it was asked for', () => {
  for (const target of [4, 30, 85]) {
    const m = measureFrame(makePose({ tilt: target }));
    assert.ok(Math.abs(m.torsoTilt - target) < 0.5, `tilt ${target} measured ${m.torsoTilt}`);
  }
});

await check('low-confidence joints stop the frame being tracked', () => {
  assert.equal(measureFrame(makePose({ visibility: 0.1 })).tracking, false);
  assert.equal(measureFrame(makePose({ visibility: 0.9 })).tracking, true);
});

// --- landmark adapters -----------------------------------------------------
group('pose: landmark adapters');

await check('MediaPipe indices map to the right joints', () => {
  const raw = Array.from({ length: 33 }, (_, i) => ({ x: i / 100, y: 0.5, visibility: 0.9 }));
  const p = fromMediaPipe(raw);
  assert.equal(p.leftShoulder.x, 0.11);
  assert.equal(p.rightShoulder.x, 0.12);
  assert.equal(p.leftElbow.x, 0.13);
  assert.equal(p.leftWrist.x, 0.15);
  assert.equal(p.leftHip.x, 0.23);
  assert.equal(p.rightAnkle.x, 0.28);
  assert.equal(p.leftShoulder.score, 0.9, 'visibility becomes score');
});

await check('MoveNet indices map to the right joints', () => {
  const raw = Array.from({ length: 17 }, (_, i) => ({ x: i / 100, y: 0.5, score: 0.8 }));
  const p = fromMoveNet(raw);
  assert.equal(p.leftShoulder.x, 0.05);
  assert.equal(p.rightShoulder.x, 0.06);
  assert.equal(p.leftElbow.x, 0.07);
  assert.equal(p.leftHip.x, 0.11);
  assert.equal(p.rightAnkle.x, 0.16);
});

await check('adapters survive missing and malformed input', () => {
  for (const bad of [null, undefined, [], 'nope', 42]) {
    const p = fromMediaPipe(bad);
    assert.deepEqual(Object.keys(p).sort(), [...JOINTS].sort());
    assert.ok(JOINTS.every((j) => p[j] === null));
  }
  const partial = fromMoveNet([{ x: 0.1, y: 0.2, score: 0.9 }]);
  assert.ok(partial.nose);
  assert.equal(partial.leftShoulder, null, 'absent indices become null, not undefined');
});

// --- counting --------------------------------------------------------------
group('pose: rep counting');

await check('a clean push-up counts once', () => {
  const a = createPushupAnalyzer();
  const { reps, events } = run(a, cycle());
  assert.equal(reps, 1);
  assert.equal(events.filter((e) => e.repCompleted).length, 1);
});

await check('five push-ups count five', () => {
  const a = createPushupAnalyzer();
  let t = 0;
  for (let i = 0; i < 5; i++) t = run(a, cycle(), t).endedAt;
  assert.equal(a.reps, 5);
});

await check('the rep is counted on the way up, not at the bottom', () => {
  const a = createPushupAnalyzer();
  // Descend and hold at the bottom: nothing should be counted yet.
  const down = run(a, [
    ...hold(200, { elbow: 172 }),
    ...ramp(172, 85, 400),
    ...hold(600, { elbow: 85 }),
  ]);
  assert.equal(a.reps, 0, 'still at the bottom');
  assert.equal(a.phase, 'down');

  // Press up and settle, continuing from where the clock actually stopped.
  run(a, [...ramp(85, 172, 400), ...hold(200, { elbow: 172 })], down.endedAt);
  assert.equal(a.reps, 1, 'counted once the press-up finished');
});

await check('reps survive a variable frame rate', () => {
  // Same motion sampled at ~7.5fps instead of 30. Timing comes from the
  // timestamps, so a quarter of the frames must still yield the same count.
  const a = createPushupAnalyzer();
  let t = 0;
  const sparse = cycle().filter((_, i) => i % 4 === 0);
  for (let i = 0; i < 3; i++) {
    for (const f of sparse) {
      a.push(makePose(f), t);
      t += STEP * 4;
    }
  }
  // Settle at the top, as a real set does between reps.
  for (const f of hold(300, { elbow: 172 })) {
    a.push(makePose(f), t);
    t += STEP * 4;
  }
  assert.equal(a.reps, 3);
});

// --- rejection -------------------------------------------------------------
group('pose: what must not count');

await check('a shallow dip counts nothing and asks for depth', () => {
  const a = createPushupAnalyzer();
  const { reps, events } = run(a, cycle({ bottom: 130 }));
  assert.equal(reps, 0);
  assert.ok(issuesIn(events).includes(ISSUES.SHALLOW));
  assert.ok(events.some((e) => e.partialRep));
});

await check('a sagging body still counts, but says so', () => {
  // The measurement is too unreliable to refuse work over — foreshortening
  // drags it below the threshold for a perfectly straight body — so the rep
  // counts and the advice is given.
  const a = createPushupAnalyzer();
  const { reps, events } = run(a, cycle({ body: 130 }));
  assert.equal(reps, 1);
  assert.ok(issuesIn(events).includes(ISSUES.BODY_SAG), 'still coaches the form');
});

await check('strict mode can veto a sagging rep', () => {
  const strict = createPushupAnalyzer({ requireStraightBody: true });
  assert.equal(run(strict, cycle({ body: 130 })).reps, 0);
  run(strict, cycle({ body: 175 }), 10000);
  assert.equal(strict.reps, 1, 'and counts once the body straightens');
});

await check('one noisy tilt frame does not veto a good rep', () => {
  // Judged on the rep's most horizontal frame, so a single bad inference
  // mid-rep cannot throw the whole thing away.
  const a = createPushupAnalyzer();
  const frames = cycle();
  frames[Math.floor(frames.length / 2)] = { ...frames[Math.floor(frames.length / 2)], tilt: 80 };
  assert.equal(run(a, frames).reps, 1);
});

await check('arm curls while standing count nothing', () => {
  // Identical elbow motion, but upright — the case that would otherwise let
  // someone farm reps by waving an arm at the camera.
  const a = createPushupAnalyzer();
  const { reps, events } = run(a, cycle({ tilt: 85 }));
  assert.equal(reps, 0);
  assert.ok(issuesIn(events).includes(ISSUES.NOT_HORIZONTAL));
});

await check('a single-frame glitch to the bottom counts nothing', () => {
  const a = createPushupAnalyzer();
  const frames = [...hold(400, { elbow: 172 }), { elbow: 70 }, ...hold(400, { elbow: 172 })];
  assert.equal(run(a, frames).reps, 0, 'one bad inference is not a rep');
});

await check('oscillating inside the hysteresis band counts nothing', () => {
  const a = createPushupAnalyzer();
  const frames = [...hold(200, { elbow: 172 })];
  for (let i = 0; i < 20; i++) {
    frames.push(...hold(120, { elbow: 110 }), ...hold(120, { elbow: 140 }));
  }
  assert.equal(run(a, frames).reps, 0);
});

await check('reps closer together than the debounce are dropped', () => {
  // minPhaseMs is relaxed so a whole cycle can finish inside the 500ms rep
  // floor; this isolates the debounce from the phase-confirmation delay.
  const a = createPushupAnalyzer({ minPhaseMs: 30 });
  const fast = [
    ...ramp(172, 85, 60),
    ...hold(100, { elbow: 85 }),
    ...ramp(85, 172, 60),
    ...hold(100, { elbow: 172 }),
  ];
  let t = 0;
  for (let i = 0; i < 6; i++) t = run(a, fast, t).endedAt;

  const cycleMs = fast.length * STEP;
  assert.ok(cycleMs < DEFAULTS.minRepMs, `cycle ${cycleMs}ms must be under the debounce`);
  assert.ok(a.reps < 6, `debounce must drop some of 6 rapid reps, got ${a.reps}`);
  assert.ok(a.reps >= 1, 'but not all of them');
});

// --- robustness ------------------------------------------------------------
group('pose: robustness');

await check('lost tracking mid-descent holds the phase and the rep still counts', () => {
  const a = createPushupAnalyzer();
  const frames = [
    ...hold(200, { elbow: 172 }),
    ...ramp(172, 85, 300),
    ...hold(200, { elbow: 85 }),
    ...hold(300, { elbow: 85, visibility: 0.05 }), // model loses the subject
    ...hold(200, { elbow: 85 }),
    ...ramp(85, 172, 300),
    ...hold(200, { elbow: 172 }),
  ];
  const { reps, events } = run(a, frames);
  assert.ok(issuesIn(events).includes(ISSUES.LOST_TRACKING));
  assert.equal(reps, 1, 'the dropout must not break the rep in two or lose it');
});

await check('an untracked frame never changes the phase', () => {
  const a = createPushupAnalyzer();
  run(a, [...hold(200, { elbow: 172 }), ...ramp(172, 85, 300), ...hold(300, { elbow: 85 })]);
  assert.equal(a.phase, 'down');
  a.push(makePose({ elbow: 172, visibility: 0.01 }), 5000);
  assert.equal(a.phase, 'down', 'phase held through the dropout');
});

await check('reset clears reps and phase', () => {
  const a = createPushupAnalyzer();
  run(a, cycle());
  assert.equal(a.reps, 1);
  a.reset();
  assert.equal(a.reps, 0);
  assert.equal(a.phase, 'unknown');
});

group('pose: adaptive thresholds');

await check('a shallow-measuring rep still counts, because it is this person\'s full range', () => {
  // The reported failure: real push-ups that only measure 115 degrees because
  // the camera flattens the angle. A fixed 100-degree threshold counts none.
  const fixed = createPushupAnalyzer({ autoCalibrate: false });
  let t = 0;
  for (let i = 0; i < 3; i++) t = run(fixed, cycle({ bottom: 115 }), t).endedAt;
  assert.equal(fixed.reps, 0, 'fixed thresholds miss the whole set');

  const adaptive = createPushupAnalyzer();
  t = 0;
  for (let i = 0; i < 3; i++) t = run(adaptive, cycle({ bottom: 115 }), t).endedAt;
  assert.equal(adaptive.reps, 3, 'adapting to the observed range counts them');
});

await check('adaptation does not make a twitch into a rep', () => {
  // Range far too small to be a push-up, however consistent it is.
  const a = createPushupAnalyzer();
  let t = 0;
  for (let i = 0; i < 4; i++) t = run(a, cycle({ top: 172, bottom: 158 }), t).endedAt;
  assert.equal(a.reps, 0);
});

await check('the absolute ceiling still rejects a genuinely shallow rep', () => {
  // 130 degrees is a wide enough range to adapt to, but the arms have barely
  // bent — the clamp is what stops this counting.
  const a = createPushupAnalyzer();
  let t = 0;
  for (let i = 0; i < 3; i++) t = run(a, cycle({ bottom: 130 }), t).endedAt;
  assert.equal(a.reps, 0);
});

await check('deep reps still count, and thresholds are reported', () => {
  const a = createPushupAnalyzer();
  const { events } = run(a, cycle({ bottom: 80 }));
  assert.equal(a.reps, 1);
  const withThresholds = events.find((e) => e.thresholds);
  assert.ok(withThresholds, 'thresholds are exposed for the UI');
  assert.ok(withThresholds.thresholds.down <= DEFAULTS.downAngleCeiling);
});

await check('autoCalibrate can be switched off for fixed thresholds', () => {
  const a = createPushupAnalyzer({ autoCalibrate: false });
  assert.equal(run(a, cycle({ bottom: 85 })).reps, 1);
});

group('pose: configuration');

await check('fixed thresholds are configurable when adaptation is off', () => {
  // With autoCalibrate off, downAngle is the threshold; a coach wanting strict
  // depth lowers it and 95 degrees no longer qualifies.
  const strict = createPushupAnalyzer({ autoCalibrate: false, downAngle: 80 });
  assert.equal(run(strict, cycle({ bottom: 95 })).reps, 0);
  const relaxed = createPushupAnalyzer({ autoCalibrate: false, downAngle: 110 });
  assert.equal(run(relaxed, cycle({ bottom: 95 })).reps, 1);
});

await check('the adaptation ceiling is configurable', () => {
  // Someone filming from an angle that flattens further can raise the ceiling.
  const strict = createPushupAnalyzer({ downAngleCeiling: 100 });
  assert.equal(run(strict, cycle({ bottom: 115 })).reps, 0);
  const lenient = createPushupAnalyzer({ downAngleCeiling: 130 });
  assert.equal(run(lenient, cycle({ bottom: 115 })).reps, 1);
});

await check('form gating can be switched on', () => {
  const strict = createPushupAnalyzer({ requireStraightBody: true });
  assert.equal(run(strict, cycle({ body: 130 })).reps, 0);
});

await check('defaults match the proximity path where they overlap', () => {
  assert.equal(DEFAULTS.minRepMs, 500, 'same 500ms rep debounce as the sensor path');
});

// ===========================================================================
// Squats, sit-ups and jumping jacks
// ===========================================================================

// --- 3-D synthetic skeleton --------------------------------------------------
//
// The push-up skeleton above is drawn straight onto the image, which is all a
// side-on camera needs. A squat filmed from the front is a different picture
// of the same body, so these skeletons are built in 3-D and projected. Body
// axes: x across (left +), y up, z forward. Lengths are metres, roughly
// anthropometric; thigh and shin differ, as they do in real landmarks.
const SEG = { torso: 0.5, upperArm: 0.3, forearm: 0.26, thigh: 0.44, shin: 0.42 };
const HALF = { shoulder: 0.18, hip: 0.11 };

/** Unit vector `deg` away from straight down, tipped forward (negative: back). */
const sag = (deg) => [0, -Math.cos(rad(deg)), Math.sin(rad(deg))];
/** Unit vector `deg` away from straight down, out to each side. */
const out = (deg) => (s) => [s * Math.sin(rad(deg)), -Math.cos(rad(deg)), 0];
const along = (p, d, len) => [p[0] + d[0] * len, p[1] + d[1] * len, p[2] + d[2] * len];
/** A direction is a vector, or a function of the side (+1 left, -1 right). */
const dirOf = (d, s) => (typeof d === 'function' ? d(s) : d);

/** Joints in 3-D from segment directions, hips at the origin. */
function body3d({
  torso = sag(180),
  thigh = sag(0),
  shin = thigh,
  upperArm = sag(0),
  forearm = upperArm,
  seg = SEG,
}) {
  const j = {};
  for (const [side, s] of [['left', 1], ['right', -1]]) {
    const hip = [s * HALF.hip, 0, 0];
    const knee = along(hip, dirOf(thigh, s), seg.thigh);
    const shoulder = along([s * HALF.shoulder, 0, 0], torso, seg.torso);
    const elbow = along(shoulder, dirOf(upperArm, s), seg.upperArm);
    j[`${side}Hip`] = hip;
    j[`${side}Knee`] = knee;
    j[`${side}Ankle`] = along(knee, dirOf(shin, s), seg.shin);
    j[`${side}Shoulder`] = shoulder;
    j[`${side}Elbow`] = elbow;
    j[`${side}Wrist`] = along(elbow, dirOf(forearm, s), seg.forearm);
  }
  j.nose = along([0, 0, 0], torso, seg.torso + 0.2);
  return j;
}

/** Deterministic noise, so a failing run replays exactly. */
let noiseSeed = 7;
const noise = () => {
  noiseSeed = (noiseSeed * 1664525 + 1013904223) % 4294967296;
  return noiseSeed / 4294967296 - 0.5;
};

/**
 * Orthographic camera. `yaw` turns it about the vertical: 0 faces the person,
 * 90 is at their side (forward = right), -90 the other side. `roll` turns the
 * picture, so 90 shows the same body lying on the floor. `aspect` stretches x
 * the way a non-square frame's normalised coordinates do.
 */
function project(joints, { yaw = 0, roll = 0, aspect = 1, visibility = 1, hide = [], jitter = 0 } = {}) {
  const out2d = {};
  for (const [name, [x, y, z]] of Object.entries(joints)) {
    const u = x * Math.cos(rad(yaw)) + z * Math.sin(rad(yaw));
    const ur = u * Math.cos(rad(roll)) - y * Math.sin(rad(roll));
    const vr = u * Math.sin(rad(roll)) + y * Math.cos(rad(roll));
    out2d[name] = {
      x: 0.5 + (ur * 0.4) / aspect + noise() * jitter,
      y: 0.5 - vr * 0.4 + noise() * jitter,
      score: hide.includes(name) ? 0.05 : visibility,
    };
  }
  return out2d;
}

/**
 * A squat at `thigh` degrees from vertical (0 standing, 90 thighs level). The
 * shin, torso and arms follow it as they do in a real squat; `lean` overrides
 * the torso's forward lean.
 */
const squatBody = ({ thigh = 0, lean = 0.42 * thigh, shin = 0.37, seg }) =>
  body3d({ thigh: sag(thigh), shin: sag(-shin * thigh), torso: sag(180 - lean), upperArm: sag(0.9 * thigh), seg });
const squatPose = ({ thigh, lean, shin, seg, ...view }) =>
  project(squatBody({ thigh, lean, shin, seg }), { yaw: 90, ...view });

/**
 * A real phone camera: a pinhole, so whatever is nearer the lens is drawn
 * larger. The body stands on the floor facing the phone (ankles 8 cm up, `distance`
 * metres away), and the phone at `height` aims at the hips, tipped up from the
 * floor or down from a shelf as a propped phone is. The orthographic camera
 * above cannot show what depth does to the picture; this one can.
 */
function pinhole(joints, { height = 0.9, distance = 2, aspect = 0.75, aimAt = 0.9 } = {}) {
  const ankles = [joints.leftAnkle, joints.rightAnkle];
  const lift = 0.08 - Math.min(...ankles.map((a) => a[1]));
  const back = -(ankles[0][2] + ankles[1][2]) / 2;
  const cam = [0, height, distance];
  // Camera forward (toward the aim point) and up, perpendicular to it.
  const fLen = Math.hypot(aimAt - height, distance);
  const fwd = [0, (aimAt - height) / fLen, -distance / fLen];
  const up = [0, distance / fLen, (aimAt - height) / fLen];
  const out2d = {};
  for (const [name, [x, y, z]] of Object.entries(joints)) {
    const rel = [x - cam[0], y + lift - cam[1], z + back - cam[2]];
    const depth = rel[1] * fwd[1] + rel[2] * fwd[2];
    const v = rel[1] * up[1] + rel[2] * up[2];
    out2d[name] = { x: 0.5 + (0.9 * rel[0]) / depth / aspect, y: 0.5 - (0.9 * v) / depth, score: 1 };
  }
  return out2d;
}

/**
 * Lying on the back, feet forward (+z), torso `rise` degrees off the floor;
 * knees bent with the feet flat, or legs straight. Side-on by default.
 */
const situpPose = ({ rise = 0, knees = 'bent', ...view }) =>
  project(
    body3d({
      torso: sag(-90 - rise),
      thigh: knees === 'bent' ? sag(140) : sag(90),
      shin: knees === 'bent' ? sag(40) : sag(90),
      upperArm: sag(90 - rise), // arms folded on the chest
    }),
    { yaw: 90, ...view },
  );

/** Arms raised `arms` degrees from the sides, legs `legs` degrees apart each. Front-on. */
const jackPose = ({ arms = 5, legs = 3, ...view }) =>
  project(body3d({ upperArm: out(arms), thigh: out(legs) }), view);

/**
 * Standing, for everyday movement. `stride` is the walking phase in turns
 * (legs and arms swing, the swinging knee bends), `bow` tips the torso
 * forward, `wave` raises the left arm alone.
 */
const standPose = ({ stride = null, bow = 0, wave = null, ...view }) => {
  const p = stride === null ? 0 : 2 * Math.PI * stride;
  const swing = stride === null ? 0 : 1;
  return project(
    body3d({
      torso: sag(180 - bow),
      // A natural stance: feet a little ahead of the hips, never exactly under.
      thigh: (s) => sag(3 + swing * s * 25 * Math.sin(p)),
      shin: (s) => sag(3 + swing * (s * 25 * Math.sin(p) - 40 * Math.max(0, s * Math.cos(p)))),
      upperArm: (s) => (wave !== null && s === 1 ? out(wave)(s) : sag(-swing * s * 20 * Math.sin(p))),
      forearm: (s) => (wave !== null && s === 1 ? out(wave + 40)(s) : sag(-swing * s * 20 * Math.sin(p) + 10)),
    }),
    { yaw: 90, ...view },
  );
};

/** Sweep one parameter from `from` to `to` over `ms`. */
function sweep(key, from, to, ms, opts = {}) {
  const frames = [];
  const steps = Math.max(1, Math.round(ms / STEP));
  for (let i = 1; i <= steps; i++) frames.push({ ...opts, [key]: from + ((to - from) * i) / steps });
  return frames;
}

/** One rep of any exercise: settle at rest, move to the effort, pause, return, settle. */
function repOf(key, { rest, effort, downMs = 400, upMs = 400, pauseMs = 180, settleMs = 200, ...opts }) {
  return [
    ...hold(settleMs, { ...opts, [key]: rest }),
    ...sweep(key, rest, effort, downMs, opts),
    ...hold(pauseMs, { ...opts, [key]: effort }),
    ...sweep(key, effort, rest, upMs, opts),
    ...hold(settleMs, { ...opts, [key]: rest }),
  ];
}

const repeat = (n, frames) => Array.from({ length: n }, () => frames).flat();

/** Feed frames through a pose builder, returning the reps and every emitted event. */
function play(analyzer, poseOf, frames, startAt = 0, step = STEP) {
  let t = startAt;
  const events = [];
  for (const frame of frames) {
    const out2 = analyzer.push(poseOf(frame), t);
    if (out2.repCompleted || out2.partialRep || out2.issues.length) events.push({ t, ...out2 });
    t += step;
  }
  return { reps: analyzer.reps, events, endedAt: t };
}

const squat = (opts = {}) => repOf('thigh', { rest: 0, effort: 95, ...opts });
const situp = (opts = {}) =>
  repOf('rise', { rest: 3, effort: 75, downMs: 600, upMs: 600, pauseMs: 200, settleMs: 300, ...opts });
const jack = (opts = {}) =>
  repOf('arms', { rest: 5, effort: 170, legs: 3, downMs: 250, upMs: 250, pauseMs: 60, settleMs: 60, ...opts });
/** Legs spread with the arms, as in a real jumping jack. */
const withLegs = (frames) => frames.map((f) => ({ ...f, legs: 3 + ((f.arms - 5) / 165) * 17 }));

group('exercises: synthetic 3-D skeletons');

await check('squat: side-on reads the knee angle it was built with, from either side', () => {
  for (const thigh of [0, 30, 60, 90, 100]) {
    for (const yaw of [90, -90]) {
      const m = measureSquatFrame(squatPose({ thigh, yaw }));
      assert.ok(Math.abs(m.knee - (180 - thigh)) < 0.5, `thigh ${thigh} yaw ${yaw} read ${m.knee}`);
    }
  }
});

await check('squat: front-on reads the same as side-on, once standing height is known', () => {
  // The whole point of measuring height: a camera facing the person sees the
  // knee bend in depth, and the 2-D knee angle barely moves. Proof that the
  // builder really does that, so the counting tests below mean something.
  const flat = (p) => pose.angleAt(p.leftHip, p.leftKnee, p.leftAnkle);
  assert.ok(flat(squatPose({ thigh: 75, yaw: 0 })) > 165, 'the 2-D knee angle stays near straight front-on');

  for (const yaw of [0, 45]) {
    const standing = measureSquatFrame(squatPose({ thigh: 0, yaw })).hipHeight;
    for (const thigh of [15, 30, 45, 60, 75, 90]) {
      const side = measureSquatFrame(squatPose({ thigh, yaw: 90 })).knee;
      const m = measureSquatFrame(squatPose({ thigh, yaw }), {}, standing).knee;
      assert.ok(Math.abs(m - side) < 0.5, `thigh ${thigh} yaw ${yaw}: ${m} vs side-on ${side}`);
    }
  }
});

await check('squat: through a real camera, perspective moves the reading by a few degrees at any phone height', () => {
  // Measuring the knee instead read a parallel squat as 119 with the phone at
  // hip height, and a half squat as 117 with it on the floor.
  const read = (thigh, shin, view) => {
    const standing = measureSquatFrame(pinhole(squatBody({ shin }), view), view).hipHeight;
    return measureSquatFrame(pinhole(squatBody({ thigh, shin }), view), view, standing).knee;
  };
  for (const height of [0.05, 0.45, 0.9, 1.0]) {
    for (const distance of [2, 3]) {
      for (const shin of [0.3, 0.37, 0.45]) {
        const view = { height, distance, aspect: 0.75 };
        for (const thigh of [30, 50, 70, 90]) {
          const m = read(thigh, shin, view);
          assert.ok(Math.abs(m - (180 - thigh)) < 9, `${JSON.stringify({ ...view, shin, thigh })} read ${m}`);
        }
      }
    }
  }
});

await check('sit-up: the trunk angle is 180 minus the rise, either side, knees bent or straight', () => {
  for (const rise of [0, 30, 60, 90, 110]) {
    for (const view of [{ yaw: 90 }, { yaw: -90, knees: 'straight' }, { yaw: 90, aspect: 16 / 9 }]) {
      const m = measureSitupFrame(situpPose({ rise, ...view }), { aspect: view.aspect || 1 });
      assert.ok(Math.abs(m.trunk - (180 - rise)) < 0.5, `rise ${rise} ${JSON.stringify(view)} read ${m.trunk}`);
      assert.ok(m.legTilt < 5, 'legs flat on the floor');
    }
  }
});

await check('jumping jack: the arm gap is how far the arms are short of overhead', () => {
  // The shoulders sit wider than the hips, so the torso line leans in a little.
  const skew = (Math.atan2(HALF.shoulder - HALF.hip, SEG.torso) * 180) / Math.PI;
  for (const arms of [5, 45, 90, 135, 170]) {
    const m = measureJumpingJackFrame(jackPose({ arms }));
    assert.ok(Math.abs(m.armGap - (180 - arms - skew)) < 0.5, `arms ${arms} read ${m.armGap}`);
  }
  const together = measureJumpingJackFrame(jackPose({ legs: 3 })).legSpread;
  const apart = measureJumpingJackFrame(jackPose({ legs: 20 })).legSpread;
  assert.ok(apart > together * 2, `leg spread ${together} -> ${apart}`);
});

await check('the joints each signal needs must be visible', () => {
  const ankles = ['leftAnkle', 'rightAnkle'];
  assert.equal(measureSquatFrame(squatPose({ hide: ankles })).tracking, false);
  assert.equal(measureSitupFrame(situpPose({ hide: ankles })).tracking, false);
  assert.equal(measureJumpingJackFrame(jackPose({ hide: ['rightElbow'] })).tracking, false, 'both arms');
  assert.equal(measureJumpingJackFrame(jackPose({ hide: ankles })).tracking, true, 'feet are optional');
  for (const m of [measureSquatFrame(null), measureSitupFrame(null), measureJumpingJackFrame(null)]) {
    assert.equal(m.tracking, false);
  }
});

group('exercises: choosing an analyser');

await check('pose exercises are exactly the app\'s exercises, at the same cadence', () => {
  assert.deepEqual(POSE_EXERCISE_IDS, exercises.EXERCISE_IDS);
  for (const id of POSE_EXERCISE_IDS) {
    assert.equal(createAnalyzer(id).exercise, id);
    assert.equal(POSE_DEFAULTS[id].minRepMs, exercises.getExercise(id).minRepMs, `${id} minRepMs`);
  }
  assert.equal(POSE_DEFAULTS.jumpingjack.minRepMs, 350);
});

await check('an unknown exercise counts push-ups', () => {
  for (const id of ['nonsense', undefined, null, '']) {
    const a = createAnalyzer(id);
    assert.equal(a.exercise, 'pushup');
    const { reps, events } = run(a, cycle());
    assert.equal(reps, 1);
    assert.ok(Number.isFinite(events.find((e) => e.repCompleted).elbow), 'push-up readings');
  }
  const viaRegistry = createAnalyzer('pushup', { autoCalibrate: false });
  assert.equal(run(viaRegistry, cycle({ bottom: 115 })).reps, 0, 'options reach the analyser');
});

await check('issues are one shared vocabulary', () => {
  assert.deepEqual(ISSUES, {
    LOST_TRACKING: 'lostTracking',
    SHALLOW: 'shallow',
    BODY_SAG: 'bodySag',
    NOT_HORIZONTAL: 'notHorizontal',
    NOT_UPRIGHT: 'notUpright',
    NOT_LYING: 'notLying',
    NOT_IN_POSITION: 'notInPosition',
    BENT_KNEES: 'bentKnees',
  });
});

await check('holds are exactly the app\'s hold exercises', () => {
  assert.deepEqual(
    POSE_HOLD_IDS,
    exercises.EXERCISES.filter((e) => e.kind === 'hold').map((e) => e.id),
  );
  for (const id of POSE_EXERCISE_IDS) {
    assert.equal(!!createAnalyzer(id).hold, POSE_HOLD_IDS.includes(id), id);
  }
});

await check('every analyser\'s thresholds leave room for hysteresis', () => {
  for (const id of POSE_EXERCISE_IDS.filter((x) => !POSE_HOLD_IDS.includes(x))) {
    const d = POSE_DEFAULTS[id];
    assert.ok(d.downAngle < d.partialAngle && d.partialAngle < d.upAngle, `${id} fallbacks ordered`);
    assert.ok(d.downAngle <= d.downAngleCeiling && d.upAngle >= d.upAngleFloor, `${id} fallbacks inside the limits`);
    // A crunch only lifts the shoulders 25-30 degrees in all, so its band is
    // narrower; noise there is caught by minPhaseMs and the lying gate.
    const band = id === 'crunch' ? 8 : 20;
    assert.ok(d.upAngleFloor - d.downAngleCeiling >= band, `${id} limits leave a band`);
  }
  // A rest the thresholds accept must also pass the lying check.
  const s = POSE_DEFAULTS.situp;
  assert.ok(s.maxLyingTilt >= 180 - s.upAngleFloor);
});

// --- squats ------------------------------------------------------------------
group('squat: counting');

await check('a clean squat counts once', () => {
  const a = createAnalyzer('squat');
  const { reps, events } = play(a, squatPose, squat());
  assert.equal(reps, 1);
  assert.equal(events.filter((e) => e.repCompleted).length, 1);
});

await check('squats count from the front, the side, three-quarter and the other side', () => {
  for (const view of [{ yaw: 0 }, { yaw: 90 }, { yaw: 45 }, { yaw: -90 }, { yaw: 0, aspect: 16 / 9 }]) {
    const a = createAnalyzer('squat', { aspect: view.aspect || 1 });
    assert.equal(play(a, squatPose, repeat(5, squat(view))).reps, 5, JSON.stringify(view));
  }
});

await check('through a real camera, parallel squats count and half squats do not, at any phone height', () => {
  for (const height of [0.05, 0.45, 0.9, 1.0]) {
    for (const distance of [2, 3]) {
      const view = { height, distance, aspect: 0.75 };
      const poseOf = (f) => pinhole(squatBody({ ...f, shin: 0.45 }), view);
      const label = JSON.stringify(view);
      const deep = play(createAnalyzer('squat', { aspect: 0.75 }), poseOf, [
        ...repeat(10, repOf('thigh', { rest: 0, effort: 90, downMs: 700, upMs: 700, pauseMs: 300, settleMs: 150 })),
      ]);
      assert.equal(deep.reps, 10, `parallel ${label}`);
      const half = play(createAnalyzer('squat', { aspect: 0.75 }), poseOf, repeat(10, squat({ effort: 50 })));
      assert.equal(half.reps, 0, `half ${label}`);
    }
  }
});

await check('long shins standing below the fallback threshold still count, once adapted', () => {
  // Front-on, a thigh shorter than the shin reads 153 degrees standing straight,
  // under the 155 rest threshold. The adapted thresholds take it from there.
  const seg = { ...SEG, thigh: 0.42, shin: 0.47 };
  const a = createAnalyzer('squat');
  assert.equal(play(a, squatPose, repeat(3, squat({ yaw: 0, seg }))).reps, 3);
});

await check('the squat is counted on the way up, not at the bottom', () => {
  const a = createAnalyzer('squat');
  const down = play(a, squatPose, [...hold(200, { thigh: 0 }), ...sweep('thigh', 0, 95, 400), ...hold(600, { thigh: 95 })]);
  assert.equal(a.reps, 0, 'still at the bottom');
  assert.equal(a.phase, 'down');
  play(a, squatPose, [...sweep('thigh', 95, 0, 400), ...hold(200, { thigh: 0 })], down.endedAt);
  assert.equal(a.reps, 1);
});

group('squat: what must not count');

await check('a half squat counts nothing and asks for depth', () => {
  const a = createAnalyzer('squat');
  const { reps, events } = play(a, squatPose, repeat(3, squat({ effort: 50 })));
  assert.equal(reps, 0);
  assert.ok(issuesIn(events).includes(ISSUES.SHALLOW));
  assert.ok(events.some((e) => e.partialRep));
});

await check('squatting legs in a plank (burpee kick-outs) count nothing', () => {
  // Knees tucked under the hips read as standing and kicked back read as deep,
  // so the legs alone make a perfect squat. Only the torso tells.
  const plank = ({ tuck }) =>
    project(body3d({ torso: sag(100), thigh: sag(-80 + 95 * tuck), shin: sag(-80 - 5 * tuck), upperArm: sag(0) }), {
      yaw: 90,
    });
  const a = createAnalyzer('squat');
  const { reps, events } = play(a, plank, repeat(3, repOf('tuck', { rest: 1, effort: 0 })));
  assert.equal(reps, 0);
  assert.ok(issuesIn(events).includes(ISSUES.NOT_UPRIGHT));
});

await check('lying on the back pulling the knees in counts nothing', () => {
  const lying = ({ pull }) =>
    project(body3d({ torso: sag(-90), thigh: sag(90 + pull), shin: sag(90 - pull / 2) }), { yaw: 90 });
  const a = createAnalyzer('squat');
  assert.equal(play(a, lying, repeat(4, repOf('pull', { rest: 0, effort: 100 }))).reps, 0);
});

await check('one noisy torso frame does not veto a squat', () => {
  const a = createAnalyzer('squat');
  const frames = squat();
  const mid = Math.floor(frames.length / 2);
  frames[mid] = { ...frames[mid], lean: 88 };
  assert.equal(play(a, squatPose, frames).reps, 1);
});

await check('squats closer together than the debounce are dropped', () => {
  const a = createAnalyzer('squat', { minPhaseMs: 30 });
  const fast = repOf('thigh', { rest: 0, effort: 95, downMs: 60, upMs: 60, pauseMs: 100, settleMs: 50 });
  assert.ok(fast.length * STEP < POSE_DEFAULTS.squat.minRepMs, 'cycle must be under the debounce');
  const { reps } = play(a, squatPose, repeat(6, fast));
  assert.ok(reps < 6 && reps >= 1, `got ${reps}`);
});

await check('lost tracking at the bottom holds the phase and the squat still counts', () => {
  const a = createAnalyzer('squat');
  const ankles = ['leftAnkle', 'rightAnkle'];
  const frames = [
    ...hold(200, { thigh: 0 }),
    ...sweep('thigh', 0, 95, 300),
    ...hold(200, { thigh: 95 }),
    ...hold(300, { thigh: 95, hide: ankles }), // ankles out of frame
    ...sweep('thigh', 95, 0, 300),
    ...hold(200, { thigh: 0 }),
  ];
  const { reps, events } = play(a, squatPose, frames);
  assert.ok(issuesIn(events).includes(ISSUES.LOST_TRACKING));
  assert.equal(reps, 1);
});

await check('bobbing inside the hysteresis band counts nothing', () => {
  const a = createAnalyzer('squat');
  const frames = [...hold(300, { thigh: 0 })];
  for (let i = 0; i < 20; i++) frames.push(...hold(120, { thigh: 35 }), ...hold(120, { thigh: 55 }));
  assert.equal(play(a, squatPose, frames).reps, 0);
});

// --- sit-ups -----------------------------------------------------------------
group('sit-up: counting');

await check('a clean sit-up counts once', () => {
  const a = createAnalyzer('situp');
  const { reps, events } = play(a, situpPose, situp());
  assert.equal(reps, 1);
  assert.equal(events.filter((e) => e.repCompleted).length, 1);
});

await check('sit-ups count from either side, knees bent or straight', () => {
  for (const view of [{ yaw: 90 }, { yaw: -90 }, { yaw: 90, knees: 'straight' }, { yaw: -60, aspect: 16 / 9 }]) {
    const a = createAnalyzer('situp', { aspect: view.aspect || 1 });
    assert.equal(play(a, situpPose, repeat(5, situp(view))).reps, 5, JSON.stringify(view));
  }
});

await check('the sit-up is counted on the way back down', () => {
  const a = createAnalyzer('situp');
  const up = play(a, situpPose, [...hold(300, { rise: 3 }), ...sweep('rise', 3, 75, 600), ...hold(600, { rise: 75 })]);
  assert.equal(a.reps, 0, 'still sitting up');
  assert.equal(a.phase, 'down', 'the effort phase');
  play(a, situpPose, [...sweep('rise', 75, 3, 600), ...hold(300, { rise: 3 })], up.endedAt);
  assert.equal(a.reps, 1);
});

group('sit-up: what must not count');

await check('a crunch counts nothing and asks to come up higher', () => {
  const a = createAnalyzer('situp');
  const { reps, events } = play(a, situpPose, repeat(3, situp({ effort: 35 })));
  assert.equal(reps, 0);
  assert.ok(issuesIn(events).includes(ISSUES.SHALLOW));
});

await check('standing and bowing counts nothing, and says to lie down', () => {
  for (const yaw of [90, -90]) {
    const a = createAnalyzer('situp');
    const { reps, events } = play(a, (f) => standPose({ ...f, yaw }), repeat(3, repOf('bow', { rest: 0, effort: 80 })));
    assert.equal(reps, 0);
    assert.ok(issuesIn(events).includes(ISSUES.NOT_LYING), `yaw ${yaw}`);
  }
});

await check('sitting on a chair, leaning back and forth, counts nothing', () => {
  const chair = ({ lean }) =>
    project(body3d({ torso: sag(180 - lean), thigh: sag(90), shin: sag(0), upperArm: sag(20) }), { yaw: 90 });
  const a = createAnalyzer('situp');
  assert.equal(play(a, chair, repeat(4, repOf('lean', { rest: -35, effort: 45 }))).reps, 0);
});

await check('standing, sitting down and lying back is no free rep', () => {
  // The rep this lands on ends lying back, so its own frames would pass a
  // lying check. The rest before it is what has to be lying.
  const a = createAnalyzer('situp');
  let t = play(a, standPose, hold(600, {})).endedAt;
  const { reps, events, endedAt } = play(
    a,
    situpPose,
    [...hold(600, { rise: 90, knees: 'straight' }), ...sweep('rise', 90, 3, 800, { knees: 'straight' }), ...hold(600, { rise: 3, knees: 'straight' })],
    t,
  );
  assert.equal(reps, 0);
  assert.ok(issuesIn(events).includes(ISSUES.NOT_LYING));
  t = endedAt;
  assert.equal(play(a, situpPose, situp({ knees: 'straight' }), t).reps, 1, 'the first real one counts');
});

await check('sit-ups closer together than the debounce are dropped', () => {
  const a = createAnalyzer('situp', { minPhaseMs: 30 });
  const fast = repOf('rise', { rest: 3, effort: 75, downMs: 60, upMs: 60, pauseMs: 100, settleMs: 50 });
  assert.ok(fast.length * STEP < POSE_DEFAULTS.situp.minRepMs);
  const { reps } = play(a, situpPose, repeat(6, fast));
  assert.ok(reps < 6 && reps >= 1, `got ${reps}`);
});

await check('lost tracking at the top holds the phase and the sit-up still counts', () => {
  const a = createAnalyzer('situp');
  const frames = [
    ...hold(300, { rise: 3 }),
    ...sweep('rise', 3, 75, 500),
    ...hold(200, { rise: 75 }),
    ...hold(300, { rise: 75, visibility: 0.05 }), // model loses the subject
    ...sweep('rise', 75, 3, 500),
    ...hold(300, { rise: 3 }),
  ];
  const { reps, events } = play(a, situpPose, frames);
  assert.ok(issuesIn(events).includes(ISSUES.LOST_TRACKING));
  assert.equal(reps, 1);
});

await check('rocking inside the hysteresis band counts nothing', () => {
  const a = createAnalyzer('situp');
  const frames = [...hold(300, { rise: 3 })];
  for (let i = 0; i < 20; i++) frames.push(...hold(120, { rise: 33 }), ...hold(120, { rise: 50 }));
  assert.equal(play(a, situpPose, frames).reps, 0);
});

// --- jumping jacks -------------------------------------------------------------
group('jumping jack: counting');

await check('a clean jumping jack counts once', () => {
  const a = createAnalyzer('jumpingjack');
  const { reps, events } = play(a, jackPose, withLegs(jack()));
  assert.equal(reps, 1);
  assert.equal(events.filter((e) => e.repCompleted).length, 1);
});

await check('brisk jacks, two a second, all count', () => {
  const brisk = withLegs(jack({ downMs: 200, upMs: 200, pauseMs: 30, settleMs: 20 }));
  assert.ok(brisk.length * STEP <= 500, `cycle ${brisk.length * STEP}ms`);
  const a = createAnalyzer('jumpingjack');
  // Arms down at the end, as a set finishes: the last rep counts on that rest.
  assert.equal(play(a, jackPose, [...repeat(8, brisk), ...hold(200, { arms: 5 })]).reps, 8);
});

await check('brisk jacks still all count at 15fps', () => {
  // What a phone on the CPU delegate delivers: every other frame.
  const brisk = withLegs(jack({ downMs: 200, upMs: 200, pauseMs: 30, settleMs: 20 }));
  const a = createAnalyzer('jumpingjack');
  const frames = [...repeat(8, brisk), ...hold(200, { arms: 5 })];
  assert.equal(play(a, jackPose, frames.filter((_, i) => i % 2 === 0), 0, STEP * 2).reps, 8);
});

await check('brisk jacks, two a second, still count at 10fps with uneven frame timing', () => {
  // A cheap phone on the CPU delegate: about 10 frames a second, never evenly
  // spaced. The arms are near the sides for one frame of each jack.
  for (const hz of [1.67, 2]) {
    const a = createAnalyzer('jumpingjack', { aspect: 0.75 });
    const jacks = 20;
    for (let i = 0; i * 100 <= (jacks / hz) * 1000 + 300; i++) {
      const t = i * 100 + noise() * 30;
      const s = Math.min(t, (jacks / hz) * 1000) / 1000;
      const arms = 90 - 85 * Math.cos(2 * Math.PI * hz * s);
      a.push(jackPose({ arms, legs: 3 + ((arms - 5) / 170) * 17, aspect: 0.75 }), t);
    }
    assert.ok(a.reps >= 18, `${hz}/s: ${a.reps} of ${jacks}`);
  }
});

await check('the jack is counted when the arms come down', () => {
  const a = createAnalyzer('jumpingjack');
  const up = play(a, jackPose, [...hold(200, { arms: 5 }), ...sweep('arms', 5, 170, 250), ...hold(400, { arms: 170 })]);
  assert.equal(a.reps, 0, 'arms still overhead');
  assert.equal(a.phase, 'down', 'the effort phase');
  play(a, jackPose, [...sweep('arms', 170, 5, 250), ...hold(200, { arms: 5 })], up.endedAt);
  assert.equal(a.reps, 1);
});

await check('the legs are reported but do not veto', () => {
  // Feet together the whole time: the arms did the work the count is for, and
  // ankles are too unreliable to refuse a rep over.
  const a = createAnalyzer('jumpingjack');
  const { reps, events } = play(a, jackPose, repeat(3, jack({ legs: 3 })));
  assert.equal(reps, 3);
  assert.ok(events.every((e) => Number.isFinite(e.legSpread)));
});

group('jumping jack: what must not count');

await check('arms only to shoulder height count nothing and ask for arms up', () => {
  const a = createAnalyzer('jumpingjack');
  const { reps, events } = play(a, jackPose, repeat(3, withLegs(jack({ effort: 90 }))));
  assert.equal(reps, 0);
  assert.ok(issuesIn(events).includes(ISSUES.SHALLOW));
});

await check('the same arm sweep lying on the floor counts nothing', () => {
  const a = createAnalyzer('jumpingjack');
  const { reps, events } = play(a, (f) => jackPose({ ...f, roll: 90 }), repeat(3, jack()));
  assert.equal(reps, 0);
  assert.ok(issuesIn(events).includes(ISSUES.NOT_UPRIGHT));
});

await check('a two-frame glitch of arms overhead counts nothing', () => {
  const a = createAnalyzer('jumpingjack');
  const glitch = [...hold(400, { arms: 5 }), { arms: 170 }, { arms: 170 }, ...hold(400, { arms: 5 })];
  assert.equal(play(a, jackPose, repeat(5, glitch)).reps, 0);
});

await check('jacks closer together than the debounce are dropped', () => {
  const a = createAnalyzer('jumpingjack', { minPhaseMs: 30 });
  const fast = repOf('arms', { rest: 5, effort: 170, downMs: 60, upMs: 60, pauseMs: 40, settleMs: 40 });
  assert.ok(fast.length * STEP < POSE_DEFAULTS.jumpingjack.minRepMs);
  const { reps } = play(a, jackPose, repeat(6, fast));
  assert.ok(reps < 6 && reps >= 1, `got ${reps}`);
});

await check('elbows leaving the frame overhead hold the phase and the jack still counts', () => {
  const a = createAnalyzer('jumpingjack');
  const elbows = ['leftElbow', 'rightElbow'];
  const frames = [
    ...hold(200, { arms: 5 }),
    ...sweep('arms', 5, 170, 250),
    ...hold(150, { arms: 170 }),
    ...hold(200, { arms: 170, hide: elbows }),
    ...sweep('arms', 170, 5, 250),
    ...hold(200, { arms: 5 }),
  ];
  const { reps, events } = play(a, jackPose, frames);
  assert.ok(issuesIn(events).includes(ISSUES.LOST_TRACKING));
  assert.equal(reps, 1);
});

await check('arms flapping inside the hysteresis band count nothing', () => {
  const a = createAnalyzer('jumpingjack');
  const frames = [...hold(300, { arms: 5 })];
  for (let i = 0; i < 20; i++) frames.push(...hold(120, { arms: 70 }), ...hold(120, { arms: 105 }));
  assert.equal(play(a, jackPose, frames).reps, 0);
});

// ===========================================================================
// The exercise library: every other exercise the camera counts
// ===========================================================================
//
// Each one gets a body built in 3-D from the movement it is (the same body3d
// and cameras as above), a check that a clean set counts exactly, and checks
// that its look-alikes and noise count nothing.

/** An arm bent to `elbow` degrees, the upper arm `upper` degrees from hanging (sag). */
const bentArm = (upper, elbow) => ({ upperArm: sag(upper), forearm: sag(upper - (180 - elbow)) });

/** The amount (0..1) a side is moved, `alt` rising 0..1 for left then 1..2 for right. */
const sideAmount = (alt, side) => {
  const k = side === 1 ? alt : alt - 1;
  return k > 0 && k < 1 ? Math.sin(Math.PI * k) : 0;
};
/** One side, then the other, each `ms` long with a short stop between: `n` reps in all. */
const alternating = (n, ms = 500, settle = 200) => [
  ...hold(settle, { alt: 0 }),
  ...Array.from({ length: n }, (_, i) => [...sweep('alt', i % 2, (i % 2) + 1, ms), ...hold(settle, { alt: 0 })]).flat(),
  ...hold(settle, { alt: 0 }),
];
/** Scissoring legs: as one comes up the other goes down, crossing at rest. */
const scissoring = (n, msPerSide = 400) => {
  const frames = [];
  const steps = Math.round(msPerSide / STEP);
  for (let i = 0; i <= n * steps; i++) frames.push({ phi: Math.PI / 2 + (Math.PI * i) / steps });
  return [...hold(200, { phi: Math.PI / 2 }), ...frames, ...hold(200, { phi: Math.PI / 2 })];
};
const scissorAmounts = ({ phi, alt }) =>
  phi !== undefined
    ? { left: Math.max(0, Math.cos(phi)) ** 2, right: Math.max(0, -Math.cos(phi)) ** 2 }
    : { left: sideAmount(alt, 1), right: sideAmount(alt, -1) };
const perLeg = (left, right) => (s) => (s === 1 ? left : right);

// --- builders, one per movement ------------------------------------------------

/** Pike push-up side-on: hips high, elbows bending to `elbow`. */
const pikePose = ({ elbow = 170, body = 100, ...view }) =>
  project(
    body3d({ torso: sag(90 - (180 - body) / 2), thigh: sag(-90 + (180 - body) / 2), ...bentArm(20, elbow) }),
    { yaw: 90, ...view },
  );
/** Chair dip side-on: seated on the edge, legs forward; `d` 0 arms straight .. 1 at the bottom. */
const dipPose = ({ d = 0, standing = false, ...view }) =>
  project(
    body3d({
      torso: sag(170),
      thigh: standing ? sag(0) : sag(85),
      shin: standing ? sag(0) : sag(10),
      upperArm: sag(-(5 + 90 * d)),
      forearm: sag(-5),
    }),
    { yaw: 90, ...view },
  );
/** Standing curls side-on; `left`/`right` 0 hanging .. 1 curled to 40 degrees. */
const curlPose = ({ left = 0, right = left, raise = 0, ...view }) =>
  project(
    body3d({
      upperArm: sag(raise),
      forearm: (s) => sag(raise + 140 * (s === 1 ? left : right)),
    }),
    { yaw: 90, ...view },
  );
/** Overhead press front-on; `d` 0 hands at the shoulders .. 1 locked out overhead. */
const pressPose = ({ d = 0, straight = false, ...view }) => {
  const r = 90 + 80 * d;
  const f = straight ? r : 180 * (1 - d) + r * d;
  return project(body3d({ upperArm: out(r), forearm: out(f) }), view);
};
/** Arms raised `raise` degrees, straight: out to the sides (front-on), or forward (side-on). */
const raisePose = ({ raise = 5, forward = false, ...view }) =>
  forward
    ? project(body3d({ upperArm: sag(raise) }), { yaw: 90, ...view })
    : project(body3d({ upperArm: out(raise), forearm: out(raise) }), view);
/** Lunge side-on, alternating legs: the front thigh drops to level, the back knee toward the floor. */
const lungePose = (f) => {
  const { left, right } = scissorAmounts(f);
  const front = (a) => sag(90 * a * (f.depth ?? 1));
  return project(
    body3d({
      thigh: (s) => (left > right ? (s === 1 ? front(left) : sag(-15 * left)) : s === -1 ? front(right) : sag(-15 * right)),
      shin: (s) => (left > right ? (s === 1 ? sag(0) : sag(-80 * left)) : s === -1 ? sag(0) : sag(-80 * right)),
    }),
    { yaw: 90, ...f.view },
  );
};
/** Lying on the back, knees bent; `d` 0 hips down .. 1 bridged. `single` holds the left leg out straight. */
const bridgePose = ({ d = 0, single = false, ...view }) =>
  project(
    body3d({
      torso: sag(-90 + 30 * d),
      thigh: sag(135 - 15 * d),
      shin: (s) => (single && s === 1 ? sag(135 - 15 * d) : sag(-20)),
      upperArm: sag(-90),
    }),
    { yaw: 90, ...view },
  );
/** On all fours; the left leg kicks back (`kick`) or out to the side (`hydrant`), 0..1. */
const allFoursPose = ({ kick = 0, hydrant = 0, ...view }) =>
  project(
    body3d({
      torso: sag(90),
      thigh: (s) =>
        s === 1 && kick ? sag(-90 * kick) : s === 1 && hydrant ? [Math.sin(rad(70 * hydrant)), -Math.cos(rad(70 * hydrant)), 0] : sag(0),
      shin: (s) => (s === 1 && kick ? sag(-90 - 90 * kick) : sag(-90)),
      upperArm: sag(0),
    }),
    { yaw: 90, ...view },
  );
/** Lying on the back, straight legs raised `legs` degrees off the floor. */
const legRaisePose = ({ legs = 0, rise = 0, ...view }) =>
  project(body3d({ torso: sag(-90 - rise), thigh: sag(90 + legs), shin: sag(90 + legs), upperArm: sag(-90) }), {
    yaw: 90,
    ...view,
  });
/** Bicycle crunch side-on: shoulders curled up, knees driving in alternately. */
const bicyclePose = (f) => {
  const { left, right } = scissorAmounts(f);
  return project(
    body3d({ torso: sag(-115), thigh: perLeg(sag(100 + 70 * left), sag(100 + 70 * right)), upperArm: sag(-150) }),
    { yaw: 90, ...f.view },
  );
};
/** Mountain climbers: a plank, knees driving toward the chest alternately. */
const climberPose = (f) => {
  const { left, right } = scissorAmounts(f);
  return project(
    body3d({
      torso: sag(90 + (f.raise || 0)),
      thigh: perLeg(sag(-90 + 135 * left), sag(-90 + 135 * right)),
      shin: perLeg(sag(-90 + 45 * left), sag(-90 + 45 * right)),
      upperArm: sag(0),
    }),
    { yaw: 90, ...f.view },
  );
};
/** High knees: thighs lifted to level alternately; any view. */
const kneesPose = (f) => {
  const { left, right } = scissorAmounts(f);
  return project(body3d({ thigh: perLeg(sag(90 * left), sag(90 * right)), shin: sag(5) }), { yaw: 0, ...f.view });
};
/** Butt kicks: heels kicked up behind alternately; any view. */
const kicksPose = (f) => {
  const { left, right } = scissorAmounts(f);
  return project(body3d({ shin: perLeg(sag(-140 * left), sag(-140 * right)) }), { yaw: 0, ...f.view });
};
/** Seated, leaning back, knees up, hands together swinging `tw` degrees to a side. Front-on. */
const twistPose = ({ tw = 0, standing = false, ...view }) => {
  const v = [Math.sin(rad(tw)), -0.35, 0.9 * Math.cos(rad(tw))];
  const n = Math.hypot(...v);
  const arm = (s) => [v[0] / n - s * 0.3, v[1] / n, v[2] / n];
  return project(
    body3d(
      standing
        ? { upperArm: arm, forearm: arm }
        : { torso: sag(-135), thigh: sag(120), shin: sag(30), upperArm: arm, forearm: arm },
    ),
    view,
  );
};
const twisting = (n, ms = 700) => {
  const frames = [];
  const steps = Math.round(ms / STEP);
  for (let i = 0; i <= n * steps; i++) frames.push({ tw: 50 * Math.sin((Math.PI * i) / steps) });
  return [...hold(200, { tw: 0 }), ...frames, ...hold(200, { tw: 0 })];
};
/**
 * Burpee keyframes side-on: standing (0), squat (1), plank (2). `stage` moves
 * between them; each joint direction is interpolated.
 */
const BURPEE_KEYS = [
  { torso: 180, thigh: 0, shin: 0 },
  { torso: 140, thigh: 100, shin: -40 },
  { torso: 90, thigh: -90, shin: -90 },
];
const burpeePose = ({ stage = 0, ...view }) => {
  const i = Math.min(1, Math.floor(stage));
  const k = stage - i;
  const at = (key) => BURPEE_KEYS[i][key] + (BURPEE_KEYS[i + 1][key] - BURPEE_KEYS[i][key]) * k;
  return project(body3d({ torso: sag(at('torso')), thigh: sag(at('thigh')), shin: sag(at('shin')), upperArm: sag(at('thigh') / 2) }), {
    yaw: 90,
    ...view,
  });
};
const burpee = () => [
  ...hold(300, { stage: 0 }),
  ...sweep('stage', 0, 2, 900),
  ...hold(300, { stage: 2 }),
  ...sweep('stage', 2, 0, 900),
  ...hold(300, { stage: 0 }),
];
/** A plank side-on; `sag` drops the hips, `flat` lies down with the arms along the floor. */
const plankPose = ({ sagDeg = 0, flat = false, ...view }) =>
  project(
    body3d({
      torso: sag(90 - sagDeg),
      thigh: sag(-90 + sagDeg),
      upperArm: flat ? sag(-90) : sag(0),
      forearm: flat ? sag(-90) : sag(90),
    }),
    { yaw: 90, ...view },
  );
/** A side plank facing the camera: the body rolled onto its right side, `tilt` off level, on the right arm. */
const sidePlankPose = ({ tilt = 20, ...view }) =>
  project(
    body3d({ upperArm: (s) => (s === -1 ? out(90)(s) : sag(0)), forearm: (s) => (s === -1 ? out(90)(s) : sag(0)) }),
    { yaw: 0, roll: 90 - tilt, ...view },
  );
/** Lying on the back, shoulders and legs each lifted `lift` degrees: a hollow hold. */
const archPose = ({ lift = 25, torsoLift = lift, ...view }) =>
  project(body3d({ torso: sag(-90 - torsoLift), thigh: sag(90 + lift), upperArm: sag(-90 - torsoLift) }), {
    yaw: 90,
    ...view,
  });
/** Front-on, arms straight out at `raise` degrees from the sides. */
const circlesPose = ({ raise = 90, elbow = 180, ...view }) =>
  project(body3d({ upperArm: out(raise), forearm: out(raise + (180 - elbow)) }), view);

/** Seconds counted by a hold analyser for frames at `step` ms apart. */
const timeHeld = (id, poseOf, frames, step = STEP, startAt = 0) => play(createAnalyzer(id), poseOf, frames, startAt, step).reps;

group('library: push-up variants');

await check('knee, wide, diamond and decline push-ups count like a push-up, under their own id', () => {
  for (const id of ['kneepushup', 'widepushup', 'diamondpushup', 'declinepushup']) {
    const a = createAnalyzer(id);
    assert.equal(a.exercise, id);
    assert.equal(run(a, [...cycle(), ...cycle(), ...cycle({ tilt: 20 })]).reps, 3, id);
    assert.equal(run(createAnalyzer(id), cycle({ tilt: 85 })).reps, 0, `${id}: standing counts nothing`);
  }
});

await check('an incline push-up, hands on a chair, counts; a push-up gate would refuse it', () => {
  assert.equal(run(createAnalyzer('inclinepushup'), repeat(3, cycle({ tilt: 60 }))).reps, 3);
  assert.equal(run(createAnalyzer('pushup'), repeat(3, cycle({ tilt: 60 }))).reps, 0);
  assert.equal(run(createAnalyzer('inclinepushup'), cycle({ tilt: 85 })).reps, 0, 'standing');
});

await check('pike push-ups count with the hips piked, not from a flat plank', () => {
  const pike = repOf('elbow', { rest: 170, effort: 85 });
  assert.equal(play(createAnalyzer('pikepushup'), pikePose, repeat(4, pike)).reps, 4);
  const flat = repOf('elbow', { rest: 170, effort: 85, body: 178 });
  const { reps, events } = play(createAnalyzer('pikepushup'), pikePose, repeat(2, flat));
  assert.equal(reps, 0);
  assert.ok(issuesIn(events).includes(ISSUES.NOT_IN_POSITION));
});

await check('chair dips count seated; bending the arms standing does not', () => {
  assert.equal(play(createAnalyzer('dip'), dipPose, repeat(5, repOf('d', { rest: 0, effort: 1 }))).reps, 5);
  const standing = repeat(3, repOf('d', { rest: 0, effort: 1, standing: true }));
  assert.equal(play(createAnalyzer('dip'), dipPose, standing).reps, 0);
  assert.equal(play(createAnalyzer('dip'), dipPose, repeat(3, repOf('d', { rest: 0, effort: 0.3 }))).reps, 0, 'a shallow dip');
});

group('library: shoulders and arms');

await check('bicep curls count each arm, and both arms together once', () => {
  const alt = [...hold(200, {}), ...repOf('left', { rest: 0, effort: 1, right: 0 }), ...repOf('right', { rest: 0, effort: 1, left: 0 })];
  assert.equal(play(createAnalyzer('bicepcurl'), curlPose, repeat(3, alt)).reps, 6, 'alternating');
  assert.equal(play(createAnalyzer('bicepcurl'), curlPose, repeat(4, repOf('left', { rest: 0, effort: 1 }))).reps, 4);
});

await check('curling with the arm raised (a press, a wave) counts nothing', () => {
  const raised = repeat(3, repOf('left', { rest: 0, effort: 1, raise: 90 }));
  const { reps, events } = play(createAnalyzer('bicepcurl'), curlPose, raised);
  assert.equal(reps, 0);
  assert.ok(issuesIn(events).includes(ISSUES.NOT_IN_POSITION));
});

await check('overhead presses count from the shoulders; jumping jacks do not', () => {
  assert.equal(play(createAnalyzer('shoulderpress'), pressPose, repeat(5, repOf('d', { rest: 0, effort: 1 }))).reps, 5);
  const a = createAnalyzer('shoulderpress');
  const { reps, events } = play(a, jackPose, repeat(4, withLegs(jack())));
  assert.equal(reps, 0, 'straight arms from the sides');
  assert.ok(issuesIn(events).includes(ISSUES.NOT_IN_POSITION));
});

await check('lateral raises count both arms to shoulder height, front-on', () => {
  const raise = repOf('raise', { rest: 5, effort: 90, downMs: 600, upMs: 600 });
  assert.equal(play(createAnalyzer('lateralraise'), raisePose, repeat(5, raise)).reps, 5);
  assert.equal(play(createAnalyzer('lateralraise'), raisePose, repeat(3, repOf('raise', { rest: 5, effort: 45 }))).reps, 0, 'half way');
  // One arm only: a wave.
  const one = (f) => project(body3d({ upperArm: (s) => (s === 1 ? out(f.raise)(s) : sag(0)) }), {});
  assert.equal(play(createAnalyzer('lateralraise'), one, repeat(3, raise)).reps, 0, 'one arm');
});

await check('front raises count side-on, even with the far arm hidden', () => {
  const raise = repOf('raise', { rest: 5, effort: 90, forward: true, downMs: 600, upMs: 600 });
  assert.equal(play(createAnalyzer('frontraise'), raisePose, repeat(4, raise)).reps, 4);
  const hidden = (f) => raisePose({ ...f, hide: ['rightElbow', 'rightWrist'] });
  assert.equal(play(createAnalyzer('frontraise'), hidden, repeat(4, raise)).reps, 4);
  const lying = (f) => raisePose({ ...f, roll: 90 });
  assert.equal(play(createAnalyzer('frontraise'), lying, repeat(3, raise)).reps, 0, 'lying down');
});

await check('arm circles: time counts only with both arms out straight at shoulder height', () => {
  assert.ok(timeHeld('armcircles', circlesPose, hold(10000, { raise: 90 })) >= 9);
  assert.equal(timeHeld('armcircles', circlesPose, hold(5000, { raise: 10 })), 0, 'arms down');
  assert.equal(timeHeld('armcircles', circlesPose, hold(5000, { raise: 90, elbow: 90 })), 0, 'elbows bent');
  assert.equal(timeHeld('armcircles', (f) => circlesPose({ ...f, roll: 90 }), hold(5000, { raise: 90 })), 0, 'lying');
});

group('library: legs and glutes');

await check('sumo squats, split squats and side lunges count by the hips dropping', () => {
  for (const id of ['sumosquat', 'splitsquat', 'sidelunge']) {
    for (const yaw of [0, 90]) {
      const a = createAnalyzer(id);
      assert.equal(a.exercise, id);
      assert.equal(play(a, squatPose, repeat(4, squat({ yaw }))).reps, 4, `${id} yaw ${yaw}`);
    }
  }
});

await check('lunges count every leg, alternating', () => {
  assert.equal(play(createAnalyzer('lunge'), lungePose, alternating(6, 1200)).reps, 6);
  const shallow = (f) => lungePose({ ...f, depth: 0.35 });
  assert.equal(play(createAnalyzer('lunge'), shallow, alternating(4, 1200)).reps, 0, 'a step, not a lunge');
});

await check('wall sit: time counts with the thighs level, not standing or half way', () => {
  const sit = (f) => squatPose({ ...f, shin: 0, lean: 0 });
  assert.ok(timeHeld('wallsit', sit, hold(10000, { thigh: 90 })) >= 9);
  assert.equal(timeHeld('wallsit', sit, hold(5000, { thigh: 30 })), 0, 'half way');
  assert.equal(timeHeld('wallsit', sit, hold(5000, { thigh: 0 })), 0, 'standing');
  const a = createAnalyzer('wallsit');
  const { events } = play(a, sit, hold(2000, { thigh: 30 }));
  assert.ok(issuesIn(events).includes(ISSUES.SHALLOW), 'asks for depth');
});

await check('glute bridges count; a bow from standing does not', () => {
  assert.equal(play(createAnalyzer('glutebridge'), bridgePose, repeat(5, repOf('d', { rest: 0, effort: 1 }))).reps, 5);
  const bow = repeat(3, repOf('bow', { rest: 0, effort: 80 }));
  assert.equal(play(createAnalyzer('glutebridge'), (f) => standPose({ ...f, yaw: 90 }), bow).reps, 0);
  assert.equal(play(createAnalyzer('glutebridge'), bridgePose, repeat(3, repOf('d', { rest: 0, effort: 0.3 }))).reps, 0, 'a lift, not a bridge');
});

await check('single-leg bridges read the working leg, with the other held out straight', () => {
  const single = repeat(4, repOf('d', { rest: 0, effort: 1, single: true }));
  assert.equal(play(createAnalyzer('singlelegbridge'), bridgePose, single).reps, 4);
});

await check('donkey kicks count side-on from all fours', () => {
  assert.equal(play(createAnalyzer('donkeykick'), allFoursPose, repeat(5, repOf('kick', { rest: 0, effort: 1 }))).reps, 5);
  const standing = (f) => project(body3d({ thigh: perLeg(sag(90 * f.kick), sag(0)) }), { yaw: 90 });
  const { reps } = play(createAnalyzer('donkeykick'), standing, repeat(3, repOf('kick', { rest: 0, effort: 1 })));
  assert.equal(reps, 0, 'a standing knee raise is not a donkey kick');
});

await check('fire hydrants count from the front (or behind), from all fours', () => {
  for (const yaw of [0, 180]) {
    const frames = repeat(4, repOf('hydrant', { rest: 0, effort: 1, yaw }));
    assert.equal(play(createAnalyzer('firehydrant'), allFoursPose, frames).reps, 4, `yaw ${yaw}`);
  }
});

await check('good mornings count a flat-back hinge; squats and sit-ups do not', () => {
  const hinge = repOf('bow', { rest: 0, effort: 75, downMs: 700, upMs: 700 });
  assert.equal(play(createAnalyzer('goodmorning'), (f) => standPose({ ...f, yaw: 90 }), repeat(4, hinge)).reps, 4);
  const sq = play(createAnalyzer('goodmorning'), (f) => squatPose({ ...f, lean: 0.8 * f.thigh }), repeat(3, squat()));
  assert.equal(sq.reps, 0, 'a squat');
  assert.ok(issuesIn(sq.events).includes(ISSUES.BENT_KNEES));
  assert.equal(play(createAnalyzer('goodmorning'), situpPose, repeat(3, situp())).reps, 0, 'a sit-up');
});

group('library: core');

await check('crunches count a shoulder lift; sit-ups count as crunches too', () => {
  assert.equal(play(createAnalyzer('crunch'), situpPose, repeat(5, situp({ effort: 30 }))).reps, 5);
  assert.equal(play(createAnalyzer('crunch'), situpPose, repeat(3, situp())).reps, 3);
  assert.equal(play(createAnalyzer('crunch'), situpPose, repeat(3, situp({ effort: 8 }))).reps, 0, 'a twitch');
  const bow = repeat(3, repOf('bow', { rest: 0, effort: 40 }));
  assert.equal(play(createAnalyzer('crunch'), (f) => standPose({ ...f, yaw: 90 }), bow).reps, 0, 'standing');
});

await check('leg raises count with the back on the floor; a sit-up folds the same angle but does not', () => {
  assert.equal(play(createAnalyzer('legraise'), legRaisePose, repeat(5, repOf('legs', { rest: 0, effort: 85, downMs: 700, upMs: 700 }))).reps, 5);
  const { reps, events } = play(createAnalyzer('legraise'), situpPose, repeat(3, situp({ knees: 'straight' })));
  assert.equal(reps, 0);
  assert.ok(issuesIn(events).includes(ISSUES.NOT_LYING));
});

await check('bicycle crunches count each knee, alternating or scissoring', () => {
  assert.equal(play(createAnalyzer('bicyclecrunch'), bicyclePose, alternating(8)).reps, 8);
  assert.equal(play(createAnalyzer('bicyclecrunch'), bicyclePose, scissoring(8)).reps, 8);
});

await check('mountain climbers count each knee drive in a plank, not standing', () => {
  assert.equal(play(createAnalyzer('mountainclimber'), climberPose, scissoring(10, 350)).reps, 10);
  const { reps, events } = play(createAnalyzer('mountainclimber'), (f) => climberPose({ ...f, raise: 90 }), scissoring(6));
  assert.equal(reps, 0, 'upright');
  assert.ok(issuesIn(events).includes(ISSUES.NOT_HORIZONTAL));
});

await check('Russian twists count every side seated; standing twists do not', () => {
  assert.equal(play(createAnalyzer('russiantwist'), twistPose, twisting(6)).reps, 6);
  const standing = (f) => twistPose({ ...f, standing: true });
  assert.equal(play(createAnalyzer('russiantwist'), standing, twisting(4)).reps, 0);
  const small = (f) => twistPose({ tw: f.tw / 5 });
  assert.equal(play(createAnalyzer('russiantwist'), small, twisting(4)).reps, 0, 'a wobble');
});

await check('plank: time counts in a straight plank only', () => {
  for (const view of [{ yaw: 90 }, { yaw: -90 }, { yaw: 90, aspect: 16 / 9 }]) {
    const t = timeHeld('plank', (f) => plankPose({ ...f, ...view }), hold(10000, {}));
    assert.ok(t >= 9 && t <= 10, `${JSON.stringify(view)}: ${t}`);
  }
  assert.equal(timeHeld('plank', plankPose, hold(5000, { sagDeg: 30 })), 0, 'hips sagging');
  assert.equal(timeHeld('plank', plankPose, hold(5000, { flat: true })), 0, 'lying flat');
  assert.equal(timeHeld('plank', () => standPose({ yaw: 90 }), hold(5000, {})), 0, 'standing');
});

await check('side plank: time counts facing the camera on one arm', () => {
  assert.ok(timeHeld('sideplank', sidePlankPose, hold(10000, {})) >= 9);
  assert.equal(timeHeld('sideplank', sidePlankPose, hold(5000, { tilt: 70 })), 0, 'propped up, not a plank');
});

await check('hollow hold and superman: time counts with both ends lifted', () => {
  assert.ok(timeHeld('hollowhold', archPose, hold(10000, {})) >= 9);
  assert.ok(timeHeld('superman', archPose, hold(10000, { lift: 12 })) >= 9);
  assert.equal(timeHeld('hollowhold', archPose, hold(5000, { lift: 0 })), 0, 'lying flat');
  assert.equal(timeHeld('hollowhold', archPose, hold(5000, { lift: 0, torsoLift: 75 })), 0, 'sitting up');
});

group('library: holds keep honest time');

await check('a hold is counted in whole seconds, one rep message a second', () => {
  const a = createAnalyzer('plank');
  const { events } = play(a, plankPose, hold(5000, {}));
  assert.equal(events.filter((e) => e.repCompleted).length, a.reps);
  assert.ok(a.reps >= 4 && a.reps <= 5);
});

await check('breaking form stops the clock; a one-frame blip does not', () => {
  const broken = [...hold(5000, {}), ...hold(2000, { sagDeg: 35 }), ...hold(5000, {})];
  const t = timeHeld('plank', plankPose, broken);
  assert.ok(t >= 9 && t <= 10, `5 s + 5 s with a 2 s break: ${t}`);
  const blips = hold(6000, {}).map((f, i) => (i % 40 === 20 ? { sagDeg: 40 } : f));
  assert.ok(timeHeld('plank', plankPose, blips) >= 5, 'single bad frames');
});

await check('a gap in the frames (paused set, stalled camera) earns nothing', () => {
  const a = createAnalyzer('plank');
  const first = play(a, plankPose, hold(3000, {}));
  play(a, plankPose, hold(3000, {}), first.endedAt + 60000);
  assert.ok(a.reps >= 5 && a.reps <= 6, `${a.reps}`);
  a.reset();
  assert.equal(a.reps, 0);
});

group('library: cardio');

await check('high knees count every knee, from the front or the side', () => {
  for (const yaw of [0, 90, 45]) {
    assert.equal(play(createAnalyzer('highknees'), (f) => kneesPose({ ...f, view: { yaw } }), scissoring(10, 350)).reps, 10, `yaw ${yaw}`);
  }
  const lowKnees = (f) => {
    const { left, right } = scissorAmounts(f);
    return project(body3d({ thigh: perLeg(sag(30 * left), sag(30 * right)) }), {});
  };
  assert.equal(play(createAnalyzer('highknees'), lowKnees, scissoring(6)).reps, 0, 'knees barely up: a jog');
});

await check('butt kicks count every heel, from the front or the side', () => {
  for (const yaw of [0, 90]) {
    assert.equal(play(createAnalyzer('buttkicks'), (f) => kicksPose({ ...f, view: { yaw } }), scissoring(10, 350)).reps, 10, `yaw ${yaw}`);
  }
});

await check('burpees count through the plank; a squat or a bow does not', () => {
  assert.equal(play(createAnalyzer('burpee'), burpeePose, repeat(4, burpee())).reps, 4);
  const toSquat = repeat(3, repOf('stage', { rest: 0, effort: 1, downMs: 600, upMs: 600 }));
  assert.equal(play(createAnalyzer('burpee'), burpeePose, toSquat).reps, 0, 'squat thrust without the kick back');
  const bow = repeat(3, repOf('bow', { rest: 0, effort: 85, downMs: 700, upMs: 700 }));
  const { reps, events } = play(createAnalyzer('burpee'), (f) => standPose({ ...f, yaw: 90 }), bow);
  assert.equal(reps, 0, 'a bow');
  assert.ok(issuesIn(events).includes(ISSUES.NOT_IN_POSITION));
});

// --- everyday movement ---------------------------------------------------------
group('every exercise: robustness');

await check('every exercise survives noisy landmarks at 15fps', () => {
  // Real landmarks wobble by around half a percent of the frame; this is twice that.
  const sets = [
    ['squat', (f) => squatPose({ ...f, yaw: 0, jitter: 0.01 }), [...repeat(5, squat()), ...hold(300, { thigh: 0 })]],
    ['squat', (f) => squatPose({ ...f, yaw: 90, jitter: 0.01 }), [...repeat(5, squat()), ...hold(300, { thigh: 0 })]],
    ['situp', (f) => situpPose({ ...f, jitter: 0.01 }), [...repeat(5, situp()), ...hold(300, { rise: 3 })]],
    ['jumpingjack', (f) => jackPose({ ...f, jitter: 0.01 }), [...repeat(5, withLegs(jack())), ...hold(300, { arms: 5 })]],
    ['pikepushup', (f) => pikePose({ ...f, jitter: 0.01 }), repeat(5, repOf('elbow', { rest: 170, effort: 85 }))],
    ['dip', (f) => dipPose({ ...f, jitter: 0.01 }), repeat(5, repOf('d', { rest: 0, effort: 1 }))],
    ['bicepcurl', (f) => curlPose({ ...f, jitter: 0.01 }), repeat(5, repOf('left', { rest: 0, effort: 1 }))],
    ['shoulderpress', (f) => pressPose({ ...f, jitter: 0.01 }), repeat(5, repOf('d', { rest: 0, effort: 1 }))],
    ['lateralraise', (f) => raisePose({ ...f, jitter: 0.01 }), repeat(5, repOf('raise', { rest: 5, effort: 90, downMs: 600, upMs: 600 }))],
    ['frontraise', (f) => raisePose({ ...f, forward: true, jitter: 0.01 }), repeat(5, repOf('raise', { rest: 5, effort: 90, downMs: 600, upMs: 600 }))],
    ['lunge', (f) => lungePose({ ...f, view: { jitter: 0.01 } }), alternating(5, 1200)],
    ['glutebridge', (f) => bridgePose({ ...f, jitter: 0.01 }), repeat(5, repOf('d', { rest: 0, effort: 1, downMs: 600, upMs: 600 }))],
    ['donkeykick', (f) => allFoursPose({ ...f, jitter: 0.01 }), repeat(5, repOf('kick', { rest: 0, effort: 1 }))],
    ['firehydrant', (f) => allFoursPose({ ...f, yaw: 0, jitter: 0.01 }), repeat(5, repOf('hydrant', { rest: 0, effort: 1 }))],
    ['goodmorning', (f) => standPose({ ...f, yaw: 90, jitter: 0.01 }), repeat(5, repOf('bow', { rest: 0, effort: 75, downMs: 700, upMs: 700 }))],
    ['crunch', (f) => situpPose({ ...f, jitter: 0.01 }), [...repeat(5, situp({ effort: 35 })), ...hold(300, { rise: 3 })]],
    ['legraise', (f) => legRaisePose({ ...f, jitter: 0.01 }), repeat(5, repOf('legs', { rest: 0, effort: 85, downMs: 700, upMs: 700 }))],
    ['bicyclecrunch', (f) => bicyclePose({ ...f, view: { jitter: 0.01 } }), scissoring(5, 500)],
    ['mountainclimber', (f) => climberPose({ ...f, view: { jitter: 0.01 } }), scissoring(5, 500)],
    ['russiantwist', (f) => twistPose({ ...f, jitter: 0.01 }), twisting(5)],
    ['highknees', (f) => kneesPose({ ...f, view: { jitter: 0.01 } }), scissoring(5, 500)],
    ['buttkicks', (f) => kicksPose({ ...f, view: { jitter: 0.01 } }), scissoring(5, 500)],
    ['burpee', (f) => burpeePose({ ...f, jitter: 0.01 }), repeat(5, burpee())],
  ];
  for (const [id, poseOf, frames] of sets) {
    const sparse = frames.filter((_, i) => i % 2 === 0);
    assert.equal(play(createAnalyzer(id), poseOf, sparse, 0, STEP * 2).reps, 5, id);
  }
});

await check('every hold keeps time through noisy landmarks at 15fps', () => {
  const sets = [
    ['plank', (f) => plankPose({ ...f, jitter: 0.01 })],
    ['sideplank', (f) => sidePlankPose({ ...f, jitter: 0.01 })],
    ['wallsit', (f) => squatPose({ thigh: 90, shin: 0, lean: 0, jitter: 0.01 })],
    ['hollowhold', (f) => archPose({ ...f, jitter: 0.01 })],
    ['superman', (f) => archPose({ ...f, lift: 15, jitter: 0.01 })],
    ['armcircles', (f) => circlesPose({ ...f, jitter: 0.01 })],
  ];
  for (const [id, poseOf] of sets) {
    const held = timeHeld(id, poseOf, hold(20000, {}).filter((_, i) => i % 2 === 0), STEP * 2);
    assert.ok(held >= 17 && held <= 20, `${id}: ${held} of 20 s`);
  }
});

await check('noise alone counts no reps and holds no time, lying, standing or on all fours', () => {
  const still = [
    (f) => standPose({ ...f, yaw: 0, jitter: 0.01 }),
    (f) => standPose({ ...f, yaw: 90, jitter: 0.01 }),
    (f) => situpPose({ ...f, rise: 0, jitter: 0.01 }),
    (f) => allFoursPose({ ...f, jitter: 0.01 }),
  ];
  for (const id of POSE_EXERCISE_IDS) {
    for (const [i, poseOf] of still.entries()) {
      // A plank on the floor, a wall sit, arm circles: holds that a still body
      // can be in are left out of the poses they are.
      const reps = play(createAnalyzer(id), poseOf, hold(8000, {})).reps;
      assert.equal(reps, 0, `${id} in still pose ${i}`);
    }
  }
});

group('every exercise: everyday movement counts nothing');

const timeline = (ms, f) => hold(ms, {}).map((_, i) => f((i * STEP) / 1000));

await check('standing still', () => {
  for (const id of POSE_EXERCISE_IDS) {
    for (const yaw of [0, 90]) {
      const a = createAnalyzer(id);
      assert.equal(play(a, () => standPose({ yaw, jitter: 0.006 }), hold(3000, {})).reps, 0, `${id} yaw ${yaw}`);
    }
  }
});

await check('walking around', () => {
  for (const id of POSE_EXERCISE_IDS) {
    for (const yaw of [0, 90, 45]) {
      const a = createAnalyzer(id);
      const frames = timeline(6000, (s) => ({ stride: s }));
      assert.equal(play(a, (f) => standPose({ ...f, yaw, jitter: 0.004 }), frames).reps, 0, `${id} yaw ${yaw}`);
    }
  }
});

await check('waving one arm overhead', () => {
  for (const id of POSE_EXERCISE_IDS) {
    for (const yaw of [0, 90]) {
      const a = createAnalyzer(id);
      const frames = repeat(4, repOf('wave', { rest: 10, effort: 165, downMs: 300, upMs: 300 }));
      assert.equal(play(a, (f) => standPose({ ...f, yaw }), frames).reps, 0, `${id} yaw ${yaw}`);
    }
  }
});

console.log(`\n${state.passed} passed, ${state.failed} failed`);
process.exit(state.failed === 0 ? 0 : 1);
