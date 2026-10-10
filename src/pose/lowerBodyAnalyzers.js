import { allVisible, angleAt, distance, tiltFromHorizontal } from './geometry';
import { ISSUES, createRepEngine, poseAnalyzer } from './repEngine';
import {
  REP_BASE_DEFAULTS,
  angleFromDown,
  eitherSide,
  legTiltOf,
  midlineOf,
  perSide,
  sideAngle,
  torsoTiltOf,
} from './readings';

/**
 * Glutes and the back of the legs: glute bridges (two legs or one), donkey
 * kicks, fire hydrants, good mornings and single-leg Romanian deadlifts. The
 * squat family — squats, sumo squats, lunges, side lunges, split squats — is
 * ./squatAnalyzer.
 */

/* --- glute bridge (and single-leg bridge) --------------------------------- */

/**
 * Side-on, lying on the back with the knees bent. Signal: how far the hip is
 * folded, 180 minus shoulder-hip-knee: about 45 lying with the knees up, near
 * 0 with the hips lifted into a straight line from shoulders to knees.
 *
 * Read on the more bent leg. With both feet down that is either; on a
 * single-leg bridge it is the working leg, while the free one is held out
 * straight — so the same analyser counts both, each side as the user does it.
 *
 * Gate: lying, judged on the rest before the rep: torso near the floor and the
 * knees above the hips. A bow from standing folds the hips too, but its knees
 * are below them.
 */
export const BRIDGE_DEFAULTS = {
  ...REP_BASE_DEFAULTS,
  minRangeDeg: 18,
  /** Hips up to within 18 degrees of a straight line... */
  downAngleCeiling: 18,
  /** ...and back down with the thighs 38 off it (feet near the seat: 45-60). */
  upAngleFloor: 38,
  downAngle: 15,
  upAngle: 40,
  partialAngle: 28,
  /** At rest the torso must lie within this many degrees of the floor. */
  maxLyingTilt: 35,
  /** At rest the knee must sit above the hip by this share of the thigh. */
  minKneeLift: 0.25,
};

function bridgeSide(pose, side, opts) {
  const joints = ['Shoulder', 'Hip', 'Knee', 'Ankle'].map((j) => side + j);
  if (!allVisible(pose, joints, opts.minVisibility)) return null;
  const [shoulder, hip, knee, ankle] = joints.map((j) => pose[j]);
  const thigh = distance(hip, knee, opts.aspect);
  return {
    knee: angleAt(hip, knee, ankle, opts.aspect),
    fold: 180 - angleAt(shoulder, hip, knee, opts.aspect),
    kneeLift: thigh > 0 ? (hip.y - knee.y) / thigh : null,
  };
}

export function measureBridgeFrame(pose, options = {}) {
  const opts = { ...BRIDGE_DEFAULTS, ...options };
  const none = { tracking: false, fold: null, kneeLift: null, torsoTilt: null };
  if (!pose) return none;
  const sides = [bridgeSide(pose, 'left', opts), bridgeSide(pose, 'right', opts)].filter(Boolean);
  if (!sides.length) return none;
  const working = sides.reduce((a, b) => (b.knee < a.knee ? b : a));
  const torsoTilt = torsoTiltOf(midlineOf(pose, opts), opts);
  return { tracking: true, fold: working.fold, kneeLift: working.kneeLift, torsoTilt };
}

export function createBridgeAnalyzer(options = {}, exercise = 'glutebridge') {
  const opts = { ...BRIDGE_DEFAULTS, ...options };
  const engine = createRepEngine(opts, [
    {
      read: (frame) => frame.torsoTilt,
      keep: 'min',
      fails: (tilt) => tilt > opts.maxLyingTilt,
      issue: ISSUES.NOT_LYING,
      veto: true,
      window: 'leadIn',
    },
    {
      read: (frame) => frame.kneeLift,
      keep: 'max',
      fails: (lift) => lift < opts.minKneeLift,
      issue: ISSUES.NOT_LYING,
      veto: true,
      window: 'leadIn',
    },
  ]);
  return poseAnalyzer(exercise, engine, (pose) => measureBridgeFrame(pose, opts), 'fold');
}

/* --- donkey kick, fire hydrant -------------------------------------------- */

/**
 * On all fours, one leg lifts: back and up for a donkey kick (filmed side-on),
 * out to the side for a fire hydrant (filmed from the front or behind, where
 * the leg swings in the picture's plane). Signal: 180 minus how far the more
 * lifted thigh has swung from hanging straight down — 180 kneeling, 90 with
 * the thigh level — so each leg's rep counts as it comes back down.
 *
 * Gate: on all fours, judged on the rest before the rep: the shoulders at
 * about the hips' height (the torso level, seen from any side) rather than a
 * torso-length above them, as standing.
 */
export const THIGH_LIFT_DEFAULTS = {
  ...REP_BASE_DEFAULTS,
  downAngleCeiling: 125,
  upAngleFloor: 145,
  downAngle: 115,
  upAngle: 155,
  partialAngle: 135,
  /** At rest, shoulders within this many thigh lengths of the hips' height. */
  maxShoulderDrop: 0.5,
};

export function measureThighLiftFrame(pose, options = {}) {
  const opts = { ...THIGH_LIFT_DEFAULTS, ...options };
  const none = { tracking: false, thigh: null, level: null };
  if (!pose) return none;
  const seen = (j) => pose[j] && pose[j].score >= opts.minVisibility;
  const lifts = perSide((s) =>
    seen(s + 'Hip') && seen(s + 'Knee') ? angleFromDown(pose[s + 'Hip'], pose[s + 'Knee'], opts.aspect) : null,
  );
  const lift = eitherSide(lifts, Math.max);
  if (lift === null) return none;

  const line = midlineOf(pose, opts);
  const thighs = perSide((s) =>
    seen(s + 'Hip') && seen(s + 'Knee') ? distance(pose[s + 'Hip'], pose[s + 'Knee'], opts.aspect) : null,
  );
  const thighLength = eitherSide(thighs, Math.max);
  const level =
    line.shoulder && line.hip && thighLength > 0 ? Math.abs(line.shoulder.y - line.hip.y) / thighLength : null;
  return { tracking: true, thigh: 180 - lift, level };
}

export function createThighLiftAnalyzer(options = {}, exercise = 'donkeykick') {
  const opts = { ...THIGH_LIFT_DEFAULTS, ...options };
  const engine = createRepEngine(opts, [
    {
      read: (frame) => frame.level,
      keep: 'min',
      fails: (level) => level > opts.maxShoulderDrop,
      issue: ISSUES.NOT_IN_POSITION,
      veto: true,
      window: 'leadIn',
    },
  ]);
  return poseAnalyzer(exercise, engine, (pose) => measureThighLiftFrame(pose, opts), 'thigh');
}

/* --- good morning (and single-leg Romanian deadlift) ---------------------- */

/**
 * Side-on, standing, hinging forward at the hips with the back flat. Signal:
 * the torso's tilt from horizontal, 90 standing and 10-30 at the bottom.
 * Gates: the knees stay nearly straight through the rep (bent, it is a squat)
 * and the legs stay upright (lying down and sitting up is a sit-up).
 *
 * A single-leg Romanian deadlift is the same hinge on one leg, the free leg
 * swinging back in line with the torso. The two legs' midpoint would lean
 * back with it and weaken the upright-legs gate, and a free leg held a little
 * bent would trip the knee gate, so with `stanceLeg` both gates read the
 * standing leg alone: the side whose hip-to-ankle line is the more upright.
 */
export const GOOD_MORNING_DEFAULTS = {
  ...REP_BASE_DEFAULTS,
  downAngleCeiling: 45,
  upAngleFloor: 65,
  downAngle: 40,
  upAngle: 75,
  partialAngle: 60,
  /** The knees' most bent frame in the rep must still be this straight. */
  minKnee: 140,
  /** The legs' most upright frame in the rep must be at least this steep. */
  minLegTilt: 60,
  /** Judge the knee and the legs' tilt on the standing leg only (single-leg hinges). */
  stanceLeg: false,
};

/**
 * The single-leg hinge: balance on one leg, not the hamstrings, is what
 * limits it, so the torso only has to get within about 50 degrees of level,
 * and the standing knee may be softer than a good morning's.
 */
export const SINGLE_LEG_RDL_DEFAULTS = {
  ...GOOD_MORNING_DEFAULTS,
  downAngleCeiling: 50,
  upAngleFloor: 70,
  downAngle: 45,
  upAngle: 78,
  partialAngle: 62,
  minKnee: 130,
  stanceLeg: true,
};

/** The standing leg, the more upright side: its knee angle and hip-to-ankle tilt. */
function stanceLegOf(pose, opts) {
  let best = null;
  for (const side of ['left', 'right']) {
    if (!allVisible(pose, [side + 'Hip', side + 'Ankle'], opts.minVisibility)) continue;
    const tilt = tiltFromHorizontal(pose[side + 'Hip'], pose[side + 'Ankle'], opts.aspect);
    if (tilt === null || (best && best.tilt >= tilt)) continue;
    best = { tilt, knee: sideAngle(pose, side, ['Hip', 'Knee', 'Ankle'], opts) };
  }
  return best;
}

export function measureGoodMorningFrame(pose, options = {}) {
  const opts = { ...GOOD_MORNING_DEFAULTS, ...options };
  if (!pose) return { tracking: false, torsoTilt: null, knee: null, legTilt: null };
  const line = midlineOf(pose, opts);
  const torsoTilt = torsoTiltOf(line, opts);
  const stance = opts.stanceLeg ? stanceLegOf(pose, opts) : null;
  if (stance) return { tracking: torsoTilt !== null, torsoTilt, knee: stance.knee, legTilt: stance.tilt };
  const knee = eitherSide(perSide((s) => sideAngle(pose, s, ['Hip', 'Knee', 'Ankle'], opts)), Math.min);
  return { tracking: torsoTilt !== null, torsoTilt, knee, legTilt: legTiltOf(line, opts) };
}

/**
 * @param {object} [options]   overrides for GOOD_MORNING_DEFAULTS
 * @param {string} [exercise]  the id it reports: 'goodmorning', or
 *   'singlelegrdl' (with SINGLE_LEG_RDL_DEFAULTS as its options)
 */
export function createGoodMorningAnalyzer(options = {}, exercise = 'goodmorning') {
  const opts = { ...GOOD_MORNING_DEFAULTS, ...options };
  const engine = createRepEngine(opts, [
    {
      read: (frame) => frame.knee,
      keep: 'min',
      fails: (knee) => knee < opts.minKnee,
      issue: ISSUES.BENT_KNEES,
      veto: true,
    },
    {
      read: (frame) => frame.legTilt,
      keep: 'max',
      fails: (tilt) => tilt < opts.minLegTilt,
      issue: ISSUES.NOT_UPRIGHT,
      veto: true,
    },
  ]);
  return poseAnalyzer(exercise, engine, (pose) => measureGoodMorningFrame(pose, opts), 'torsoTilt');
}
