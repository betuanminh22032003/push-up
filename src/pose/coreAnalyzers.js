import { ISSUES, createRepEngine, poseAnalyzer } from './repEngine';
import {
  REP_BASE_DEFAULTS,
  bodyLineOf,
  bothSides,
  legTiltOf,
  midlineOf,
  perSide,
  sideAngle,
  torsoLengthOf,
  torsoTiltOf,
} from './readings';
import { SITUP_DEFAULTS } from './situpAnalyzer';
import { windowMax } from './squatAnalyzer';

/**
 * Core and cardio: crunches, leg raises, the alternating "scissor" family
 * (bicycle crunches, mountain climbers, high knees, butt kicks), Russian
 * twists and burpees.
 */

/* --- crunch ---------------------------------------------------------------- */

/**
 * A sit-up cut short: ./situpAnalyzer's trunk angle and its lying gate, with
 * thresholds that ask for the shoulder blades off the floor (25-30 degrees)
 * instead of the torso upright. A full sit-up counts as a crunch too.
 */
export const CRUNCH_DEFAULTS = {
  ...SITUP_DEFAULTS,
  minRangeDeg: 12,
  downAngleCeiling: 160,
  upAngleFloor: 168,
  downAngle: 157,
  upAngle: 172,
  partialAngle: 165,
};

/* --- leg raise ------------------------------------------------------------- */

/**
 * Side-on, lying on the back, straight legs lifted toward vertical. Signal:
 * shoulder-hip-ankle, 180 flat and 90 with the legs straight up. Gates: the
 * rest before starts lying flat, and the torso stays on the floor through the
 * rep — a sit-up folds the same angle by lifting the other end.
 */
export const LEG_RAISE_DEFAULTS = {
  ...REP_BASE_DEFAULTS,
  downAngleCeiling: 125,
  upAngleFloor: 150,
  downAngle: 120,
  upAngle: 160,
  partialAngle: 140,
  /** Torso and legs within this many degrees of the floor in the rest before. */
  maxLyingTilt: 40,
  /** The torso's highest frame in the rep must stay this close to the floor. */
  maxTorsoLift: 35,
};

export function measureLegRaiseFrame(pose, options = {}) {
  const opts = { ...LEG_RAISE_DEFAULTS, ...options };
  if (!pose) return { tracking: false, legs: null, torsoTilt: null, legTilt: null };
  const line = midlineOf(pose, opts);
  const legs = line.ankle ? bodyLineOf(line, opts) : null;
  return { tracking: legs !== null, legs, torsoTilt: torsoTiltOf(line, opts), legTilt: legTiltOf(line, opts) };
}

export function createLegRaiseAnalyzer(options = {}) {
  const opts = { ...LEG_RAISE_DEFAULTS, ...options };
  const engine = createRepEngine(opts, [
    {
      read: (frame) =>
        Number.isFinite(frame.torsoTilt) && Number.isFinite(frame.legTilt)
          ? Math.max(frame.torsoTilt, frame.legTilt)
          : null,
      keep: 'min',
      fails: (tilt) => tilt > opts.maxLyingTilt,
      issue: ISSUES.NOT_LYING,
      veto: true,
      window: 'leadIn',
    },
    {
      read: (frame) => frame.torsoTilt,
      keep: 'max',
      fails: (tilt) => tilt > opts.maxTorsoLift,
      issue: ISSUES.NOT_LYING,
      veto: true,
    },
  ]);
  return poseAnalyzer('legraise', engine, (pose) => measureLegRaiseFrame(pose, opts), 'legs');
}

/* --- the scissor family ---------------------------------------------------- */

/**
 * Exercises that alternate the legs: one knee (or heel) comes up while the
 * other goes down. Taking either leg alone would count both legs' work as one
 * side; taking the more lifted would never see a rest, since one leg is always
 * up. The signal is the gap between them instead: 180 minus the difference of
 * the two legs' readings. The legs pass each other between sides, which is the
 * rest, so every knee drive (or heel kick) is a rep of its own — "count each
 * side". Moving both legs together (a squat, a jump) leaves the gap at rest.
 *
 * What each leg reads, by `legs`:
 *   hip    shoulder-hip-knee on the image: side-on only, for bicycle crunches
 *          (lying) and mountain climbers (in a plank)
 *   thigh  how far the knee has risen toward hip height, from the knee's
 *          height under the hip against its height standing: works from the
 *          front and the side alike, for high knees
 *   shin   the same for the heel against the knee, for butt kicks
 * The height readings follow the squat's reasoning (./squatAnalyzer): turning
 * toward or away from the camera moves joints sideways, never up or down.
 *
 * Gate by `posture`: 'upright' (high knees, butt kicks), 'lying' (bicycle) or
 * 'plank' (mountain climbers), each judged on the rep's best frame.
 */
export const SCISSOR_DEFAULTS = {
  ...REP_BASE_DEFAULTS,
  minRangeDeg: 30,
  /** The legs must get at least 55 degrees apart... */
  downAngleCeiling: 125,
  /** ...and pass within 30 of each other in between. */
  upAngleFloor: 150,
  downAngle: 120,
  upAngle: 160,
  partialAngle: 140,
  /** Alternating legs run at two or three a second; see the jumping jack. */
  minPhaseMs: 60,
  minRepMs: 250,
  legs: 'thigh',
  posture: 'upright',
  minUprightTilt: 55,
  maxLyingTilt: 50,
  maxPlankTilt: 40,
};

/** Degrees a segment has swung up from hanging, from its drop against the longest drop seen. */
function liftFromDrop(drop, longest) {
  if (!Number.isFinite(drop) || !(longest > 0)) return null;
  const share = Math.max(-1, Math.min(1, drop / Math.max(longest, drop)));
  return (Math.acos(share) * 180) / Math.PI;
}

const SCISSOR_SEGMENTS = { thigh: ['Hip', 'Knee'], shin: ['Knee', 'Ankle'] };

export function createScissorAnalyzer(options = {}, exercise = 'highknees') {
  const opts = { ...SCISSOR_DEFAULTS, ...options };

  const gate = {
    upright: { read: (f) => f.torsoTilt, keep: 'max', fails: (t) => t < opts.minUprightTilt, issue: ISSUES.NOT_UPRIGHT },
    lying: { read: (f) => f.torsoTilt, keep: 'min', fails: (t) => t > opts.maxLyingTilt, issue: ISSUES.NOT_LYING },
    plank: { read: (f) => f.torsoTilt, keep: 'min', fails: (t) => t > opts.maxPlankTilt, issue: ISSUES.NOT_HORIZONTAL },
  }[opts.posture];
  const engine = createRepEngine(opts, [{ ...gate, veto: true }]);

  // Each leg's longest drop over the calibration window: its length hanging.
  const longest = { left: windowMax(opts.calibrationWindowMs), right: windowMax(opts.calibrationWindowMs) };

  const measure = (pose, timestamp) => {
    if (!pose) return { tracking: false, gap: null, torsoTilt: null };
    let legs;
    if (opts.legs === 'hip') {
      legs = perSide((s) => sideAngle(pose, s, ['Shoulder', 'Hip', 'Knee'], opts));
    } else {
      const [top, bottom] = SCISSOR_SEGMENTS[opts.legs];
      legs = perSide((s) => {
        const a = pose[s + top];
        const b = pose[s + bottom];
        if (!a || !b || a.score < opts.minVisibility || b.score < opts.minVisibility) return null;
        const drop = b.y - a.y;
        longest[s].push(drop, timestamp);
        return liftFromDrop(drop, longest[s].max(timestamp));
      });
    }
    const gap = bothSides(legs, (l, r) => 180 - Math.abs(l - r));
    return {
      tracking: gap !== null,
      gap,
      legLeft: legs.left,
      legRight: legs.right,
      torsoTilt: torsoTiltOf(midlineOf(pose, opts), opts),
    };
  };
  const reset = () => {
    longest.left.reset();
    longest.right.reset();
  };
  return poseAnalyzer(exercise, engine, measure, 'gap', reset);
}

/* --- Russian twist --------------------------------------------------------- */

/**
 * Filmed from the front, seated with the knees up and leaning back, hands
 * together, turning from side to side. Signal: how far the hands sit to one
 * side of the hips, as an angle over the torso's length; 180 minus twice it,
 * so centred is the rest (180) and a hand-to-the-floor twist to either side
 * (40-50 degrees) is an effort near 90. Every side counts, as in the scissors.
 *
 * Gate: seated with the knees above the hips at some point in the rep;
 * twisting while standing counts nothing.
 */
export const TWIST_DEFAULTS = {
  ...REP_BASE_DEFAULTS,
  minRangeDeg: 30,
  /**
   * Half the range, not 30%: the hands only pass through the middle, never
   * stop there, and at 15fps a narrow rest band is a single frame. The limits
   * below decide instead.
   */
  rangeFraction: 0.5,
  /** The hands must swing at least 35 degrees to a side... */
  downAngleCeiling: 110,
  /** ...and pass within 25 of the middle. */
  upAngleFloor: 130,
  downAngle: 105,
  upAngle: 140,
  partialAngle: 120,
  minPhaseMs: 40,
  minRepMs: 350,
  /** The knees must sit this many torso lengths above the hips. */
  minKneeLift: 0.1,
};

export function measureTwistFrame(pose, options = {}) {
  const opts = { ...TWIST_DEFAULTS, ...options };
  const none = { tracking: false, twist: null, kneeLift: null };
  if (!pose) return none;
  const line = midlineOf(pose, opts);
  const torso = torsoLengthOf(line, opts);
  if (!torso || !line.wrist) return none;
  const offset = Math.abs(line.wrist.x - line.hip.x) * opts.aspect;
  const angle = (Math.atan2(offset, torso) * 180) / Math.PI;
  return {
    tracking: true,
    twist: Math.max(0, 180 - 2 * angle),
    kneeLift: line.knee ? (line.hip.y - line.knee.y) / torso : null,
  };
}

export function createTwistAnalyzer(options = {}) {
  const opts = { ...TWIST_DEFAULTS, ...options };
  const engine = createRepEngine(opts, [
    {
      read: (frame) => frame.kneeLift,
      keep: 'max',
      fails: (lift) => lift < opts.minKneeLift,
      issue: ISSUES.NOT_IN_POSITION,
      veto: true,
    },
  ]);
  return poseAnalyzer('russiantwist', engine, (pose) => measureTwistFrame(pose, opts), 'twist');
}

/* --- burpee ---------------------------------------------------------------- */

/**
 * Side-on: stand, drop to a squat, kick back to a plank, come back and stand
 * (and jump). Signal: the torso's tilt from horizontal, 90 standing and near 0
 * in the plank, so a rep counts on standing back up.
 *
 * Gates: the rep must reach a real plank — a straight body (shoulder-hip-ankle)
 * while the torso is low — so a bow or a squat counts nothing; and the rest
 * before it must be on the feet, so rolling over on the floor counts nothing.
 */
export const BURPEE_DEFAULTS = {
  ...REP_BASE_DEFAULTS,
  minRangeDeg: 30,
  downAngleCeiling: 40,
  upAngleFloor: 60,
  downAngle: 30,
  upAngle: 70,
  partialAngle: 50,
  minRepMs: 1000,
  /** The body must be this straight in the plank... */
  minPlankLine: 150,
  /** ...judged on frames with the torso at most this far off horizontal. */
  plankTilt: 45,
  /** The legs' steepest frame in the rest before must be standing. */
  minStandLegTilt: 60,
};

export function measureBurpeeFrame(pose, options = {}) {
  const opts = { ...BURPEE_DEFAULTS, ...options };
  if (!pose) return { tracking: false, torsoTilt: null, bodyLine: null, legTilt: null };
  const line = midlineOf(pose, opts);
  const torsoTilt = torsoTiltOf(line, opts);
  return {
    tracking: torsoTilt !== null,
    torsoTilt,
    bodyLine: line.ankle ? bodyLineOf(line, opts) : null,
    legTilt: line.ankle ? legTiltOf(line, opts) : null,
  };
}

export function createBurpeeAnalyzer(options = {}) {
  const opts = { ...BURPEE_DEFAULTS, ...options };
  const engine = createRepEngine(opts, [
    {
      read: (frame) => (Number.isFinite(frame.torsoTilt) && frame.torsoTilt <= opts.plankTilt ? frame.bodyLine : null),
      keep: 'max',
      fails: (line) => line < opts.minPlankLine,
      issue: ISSUES.NOT_IN_POSITION,
      veto: true,
    },
    {
      read: (frame) => frame.legTilt,
      keep: 'max',
      fails: (tilt) => tilt < opts.minStandLegTilt,
      issue: ISSUES.NOT_UPRIGHT,
      veto: true,
      window: 'leadIn',
    },
  ]);
  return poseAnalyzer('burpee', engine, (pose) => measureBurpeeFrame(pose, opts), 'torsoTilt');
}
