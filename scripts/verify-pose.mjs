/**
 * Assertions for pose-based push-up counting.
 *
 * Skeletons are synthesised with exact known angles, so a push-up can be
 * replayed frame by frame with no camera and no model. The builder is
 * self-checked against the geometry code first — a test built on a wrong
 * skeleton would prove nothing.
 */
import assert from 'node:assert/strict';
import { read, bundle, stripImport, createHarness } from './load.mjs';

const geometrySrc = read('src/pose/geometry.js');
const analyzerSrc = stripImport(read('src/pose/pushupAnalyzer.js'), './geometry');
const pose = await bundle(geometrySrc, analyzerSrc);
const landmarks = await bundle(read('src/pose/landmarks.js'));

const { createPushupAnalyzer, measureFrame, ISSUES, DEFAULTS } = pose;
const { fromMediaPipe, fromMoveNet, JOINTS } = landmarks;

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

await check('a sagging body counts nothing and says so', () => {
  const a = createPushupAnalyzer();
  const { reps, events } = run(a, cycle({ body: 130 }));
  assert.equal(reps, 0);
  assert.ok(issuesIn(events).includes(ISSUES.BODY_SAG));
});

await check('the same motion counts once the body straightens', () => {
  const a = createPushupAnalyzer();
  run(a, cycle({ body: 130 }));
  assert.equal(a.reps, 0);
  run(a, cycle({ body: 175 }), 10000);
  assert.equal(a.reps, 1);
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

await check('thresholds are configurable', () => {
  // A coach wanting strict depth sets a lower bottom; 95 no longer qualifies.
  const strict = createPushupAnalyzer({ downAngle: 80 });
  assert.equal(run(strict, cycle({ bottom: 95 })).reps, 0);
  const relaxed = createPushupAnalyzer({ downAngle: 110 });
  assert.equal(run(relaxed, cycle({ bottom: 95 })).reps, 1);
});

await check('form gating can be switched off', () => {
  const lenient = createPushupAnalyzer({ requireStraightBody: false });
  assert.equal(run(lenient, cycle({ body: 130 })).reps, 1);
});

await check('defaults match the proximity path where they overlap', () => {
  assert.equal(DEFAULTS.minRepMs, 500, 'same 500ms rep debounce as the sensor path');
});

console.log(`\n${state.passed} passed, ${state.failed} failed`);
process.exit(state.failed === 0 ? 0 : 1);
