import { DEFAULTS, measureFrame } from './pushupAnalyzer';
import { ISSUES, createRepEngine, poseAnalyzer } from './repEngine';
import {
  REP_BASE_DEFAULTS,
  bothSides,
  eitherSide,
  midlineOf,
  perSide,
  sideAngle,
  torsoTiltOf,
} from './readings';

/**
 * Upper-body exercises: pike push-ups, chair dips, bicep curls, the overhead
 * press, and lateral and front raises.
 *
 * Each is a rep-engine signal (high at rest, low at the effort, as the
 * push-up's elbow) plus the gates that tell it from its look-alikes: a curl
 * and a dip both bend the elbow, but a dip is seated with the hips folded and
 * a curl keeps the upper arm hanging; a press and a jumping jack both raise
 * the arms overhead, but a press starts from bent elbows.
 */

const ELBOW = ['Shoulder', 'Elbow', 'Wrist'];
const RAISE = ['Hip', 'Shoulder', 'Elbow'];
const HIP = ['Shoulder', 'Hip', 'Knee'];

/** The rep's most upright frame must be standing, as for the squat. */
function uprightGate(opts) {
  return {
    read: (frame) => frame.torsoTilt,
    keep: 'max',
    fails: (tilt) => tilt < opts.minUprightTilt,
    issue: ISSUES.NOT_UPRIGHT,
    veto: true,
  };
}

/* --- pike push-up --------------------------------------------------------- */

/**
 * Side-on, hips high in an upside-down V. The elbow is the signal, as in a
 * push-up; the gate is the pike itself: the hips must fold (shoulder-hip-knee
 * well short of straight) at some point in the rep, and the torso must not be
 * standing, so neither a straight push-up nor arm-bending on the feet counts.
 */
export const PIKE_DEFAULTS = {
  ...DEFAULTS,
  /** Shoulder-hip-knee must get at least this folded during the rep. */
  maxPikeBody: 135,
  /** The torso's flattest frame of the rep must be at most this far off horizontal. */
  maxPikeTilt: 70,
};

export function createPikePushupAnalyzer(options = {}) {
  const opts = { ...PIKE_DEFAULTS, ...options };
  const engine = createRepEngine(opts, [
    {
      read: (frame) => frame.body,
      keep: 'min',
      fails: (body) => body > opts.maxPikeBody,
      issue: ISSUES.NOT_IN_POSITION,
      veto: true,
    },
    {
      read: (frame) => frame.torsoTilt,
      keep: 'min',
      fails: (tilt) => tilt > opts.maxPikeTilt,
      issue: ISSUES.NOT_HORIZONTAL,
      veto: true,
    },
  ]);
  return poseAnalyzer('pikepushup', engine, (pose) => measureFrame(pose, opts), 'elbow');
}

/* --- chair / bench dip ---------------------------------------------------- */

/**
 * Side-on, hands on a chair behind, legs out in front. Signal: the elbow, 170
 * arms straight and about 90 at the bottom. Gates: the torso stays upright,
 * and the hips are folded (seated, legs forward) at some point in the rep, so
 * bending the arms while standing counts nothing.
 */
export const DIP_DEFAULTS = {
  ...REP_BASE_DEFAULTS,
  downAngleCeiling: 120,
  upAngleFloor: 140,
  downAngle: 105,
  upAngle: 150,
  partialAngle: 130,
  minUprightTilt: 50,
  /** Shoulder-hip-knee must get this folded in the rep: sitting, not standing. */
  maxSeatedHip: 150,
};

export function measureDipFrame(pose, options = {}) {
  const opts = { ...DIP_DEFAULTS, ...options };
  if (!pose) return { tracking: false, elbow: null, hip: null, torsoTilt: null };
  const elbow = eitherSide(perSide((s) => sideAngle(pose, s, ELBOW, opts)), (l, r) => (l + r) / 2);
  const hip = eitherSide(perSide((s) => sideAngle(pose, s, HIP, opts)), (l, r) => (l + r) / 2);
  const torsoTilt = torsoTiltOf(midlineOf(pose, opts), opts);
  return { tracking: elbow !== null, elbow, hip, torsoTilt };
}

export function createDipAnalyzer(options = {}) {
  const opts = { ...DIP_DEFAULTS, ...options };
  const engine = createRepEngine(opts, [
    uprightGate(opts),
    {
      read: (frame) => frame.hip,
      keep: 'min',
      fails: (hip) => hip > opts.maxSeatedHip,
      issue: ISSUES.NOT_IN_POSITION,
      veto: true,
    },
  ]);
  return poseAnalyzer('dip', engine, (pose) => measureDipFrame(pose, opts), 'elbow');
}

/* --- bicep curl ----------------------------------------------------------- */

/**
 * Standing side-on with a bottle or dumbbell. Signal: the more bent elbow, so
 * alternating curls count every arm and curling both counts once. Gates:
 * standing, and the upper arm hanging by the side at some point in the rep
 * (hip-shoulder-elbow small), so a press or a wave, which bend the elbow with
 * the arm raised, counts nothing.
 */
export const CURL_DEFAULTS = {
  ...REP_BASE_DEFAULTS,
  minRangeDeg: 40,
  downAngleCeiling: 80,
  upAngleFloor: 135,
  downAngle: 70,
  upAngle: 145,
  partialAngle: 110,
  minUprightTilt: 55,
  /** The upper arm must come within this many degrees of hanging straight down. */
  maxUpperArmRaise: 50,
};

export function measureCurlFrame(pose, options = {}) {
  const opts = { ...CURL_DEFAULTS, ...options };
  if (!pose) return { tracking: false, elbow: null, upperArm: null, torsoTilt: null };
  const elbows = perSide((s) => sideAngle(pose, s, ELBOW, opts));
  const raises = perSide((s) => sideAngle(pose, s, RAISE, opts));
  const elbow = eitherSide(elbows, Math.min);
  const upperArm = eitherSide(raises, Math.max);
  const torsoTilt = torsoTiltOf(midlineOf(pose, opts), opts);
  return { tracking: elbow !== null, elbow, upperArm, torsoTilt };
}

export function createCurlAnalyzer(options = {}) {
  const opts = { ...CURL_DEFAULTS, ...options };
  const engine = createRepEngine(opts, [
    uprightGate(opts),
    {
      read: (frame) => frame.upperArm,
      keep: 'min',
      fails: (raise) => raise > opts.maxUpperArmRaise,
      issue: ISSUES.NOT_IN_POSITION,
      veto: true,
    },
  ]);
  return poseAnalyzer('bicepcurl', engine, (pose) => measureCurlFrame(pose, opts), 'elbow');
}

/* --- lateral and front raises --------------------------------------------- */

/**
 * Signal: the arm gap, 180 minus the raise at the shoulder (hip-shoulder-
 * elbow), as the jumping jack's: about 170 with the arms at the sides and 90
 * at shoulder height.
 *
 * Lateral raises are filmed from the front, where the arms swing out in the
 * picture's plane, and both must rise (the lower one is the signal), so a wave
 * counts nothing. Front raises are filmed side-on, where the far arm is often
 * hidden behind the body, so whichever arms are seen decide.
 */
export const RAISE_DEFAULTS = {
  ...REP_BASE_DEFAULTS,
  minRangeDeg: 30,
  /** The arms must get within 25 degrees of shoulder height... */
  downAngleCeiling: 115,
  /** ...and come back down to within 40 degrees of the sides. */
  upAngleFloor: 140,
  downAngle: 110,
  upAngle: 150,
  partialAngle: 130,
  minUprightTilt: 55,
  /** Both arms must be seen and both must rise (lateral), or any seen arm (front). */
  bothArms: true,
};

export function measureRaiseFrame(pose, options = {}) {
  const opts = { ...RAISE_DEFAULTS, ...options };
  if (!pose) return { tracking: false, armGap: null, torsoTilt: null };
  const gaps = perSide((s) => {
    const raise = sideAngle(pose, s, RAISE, opts);
    return raise === null ? null : 180 - raise;
  });
  const armGap = opts.bothArms ? bothSides(gaps, Math.max) : eitherSide(gaps, Math.max);
  const torsoTilt = torsoTiltOf(midlineOf(pose, opts), opts);
  return { tracking: armGap !== null, armGap, torsoTilt };
}

export function createRaiseAnalyzer(options = {}, exercise = 'lateralraise') {
  const opts = { ...RAISE_DEFAULTS, ...options };
  const engine = createRepEngine(opts, [uprightGate(opts)]);
  return poseAnalyzer(exercise, engine, (pose) => measureRaiseFrame(pose, opts), 'armGap');
}

/* --- overhead press ------------------------------------------------------- */

/**
 * Filmed from the front. Signal: the arm gap as above, about 90 with the
 * elbows at shoulder height and 10-20 pressed overhead. Gate: the press starts
 * from bent elbows (hands by the shoulders) — judged on the rest before each
 * rep — which is what tells it from a jumping jack's straight arms.
 */
export const PRESS_DEFAULTS = {
  ...REP_BASE_DEFAULTS,
  minRangeDeg: 30,
  downAngleCeiling: 45,
  upAngleFloor: 65,
  downAngle: 40,
  upAngle: 75,
  partialAngle: 60,
  minUprightTilt: 55,
  /** In the rest before a rep the elbows must be bent at least this much. */
  maxStartElbow: 120,
  bothArms: true,
};

export function measurePressFrame(pose, options = {}) {
  const opts = { ...PRESS_DEFAULTS, ...options };
  const frame = measureRaiseFrame(pose, opts);
  if (!pose) return { ...frame, elbow: null };
  // The straighter of the two: both hands must start by the shoulders.
  const elbow = bothSides(perSide((s) => sideAngle(pose, s, ELBOW, opts)), Math.max);
  return { ...frame, elbow };
}

export function createPressAnalyzer(options = {}) {
  const opts = { ...PRESS_DEFAULTS, ...options };
  const engine = createRepEngine(opts, [
    uprightGate(opts),
    {
      read: (frame) => frame.elbow,
      keep: 'min',
      fails: (elbow) => elbow > opts.maxStartElbow,
      issue: ISSUES.NOT_IN_POSITION,
      veto: true,
      window: 'leadIn',
    },
  ]);
  return poseAnalyzer('shoulderpress', engine, (pose) => measurePressFrame(pose, opts), 'armGap');
}
