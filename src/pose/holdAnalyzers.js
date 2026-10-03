import { ISSUES } from './repEngine';
import {
  armSupportOf,
  bodyLineOf,
  bothSides,
  eitherSide,
  legTiltOf,
  midlineOf,
  perSide,
  sideAngle,
  torsoTiltOf,
} from './readings';

/**
 * Isometric holds: planks, side planks, wall sits, hollow holds, supermans and
 * arm circles. Nothing goes up and down, so there is nothing for the rep
 * engine to count; what counts is time spent in the position, and only while
 * the form is right.
 *
 * Each hold measures a frame and lists what is wrong with it (the same issue
 * vocabulary as the reps, ./repEngine). The hold engine below turns that into
 * seconds held, and the analyser reports them as reps — one per whole second
 * — with the same contract as every rep analyser (`reps`, `phase`, `reset()`,
 * `push()` returning { reps, phase, repCompleted, issues, tracking, ... }).
 * So the page, the stages and the workout screen count a plank exactly as they
 * count push-ups: the counter shows seconds, a target of 30 is 30 seconds, and
 * the history stores them as the session's total.
 *
 * Honest timing:
 *   startMs   the form must hold this long before the clock starts (then the
 *             wait is credited), so passing through a plank on the way to the
 *             floor is not a hold
 *   graceMs   a break shorter than this — one bad inference, a wobble — does
 *             not stop the hold, but its frames earn nothing
 *   maxGapMs  no single frame earns more than this, so a stalled camera or a
 *             paused set cannot credit the time it was away
 */

export const HOLD_BASE_DEFAULTS = {
  minVisibility: 0.4,
  startMs: 400,
  graceMs: 500,
  maxGapMs: 250,
  /** One "rep" is a second held; also the app's fastest believable rep. */
  minRepMs: 1000,
  aspect: 1,
};

/**
 * @param {object} opts  startMs, graceMs, maxGapMs
 */
export function createHoldEngine(opts) {
  let holding = false;
  let heldMs = 0;
  let goodSince = null;
  let badSince = null;
  let lastAt = null;

  return {
    get reps() {
      return Math.floor(heldMs / 1000);
    },
    get phase() {
      return holding ? 'down' : 'up';
    },
    get heldMs() {
      return heldMs;
    },
    reset() {
      holding = false;
      heldMs = 0;
      goodSince = null;
      badSince = null;
      lastAt = null;
    },
    /**
     * @param {string[]|null} issues  what is wrong with this frame; null when
     *                                the body is not tracked at all
     * @param {number} timestamp      milliseconds, monotonic
     */
    push(issues, timestamp) {
      const before = Math.floor(heldMs / 1000);
      const tracked = Array.isArray(issues);
      const good = tracked && issues.length === 0;
      const dt = lastAt === null ? 0 : Math.max(0, Math.min(timestamp - lastAt, opts.maxGapMs));
      lastAt = timestamp;

      if (good) {
        badSince = null;
        if (holding) {
          heldMs += dt;
        } else {
          if (goodSince === null) goodSince = timestamp;
          if (timestamp - goodSince >= opts.startMs) {
            holding = true;
            heldMs += timestamp - goodSince;
          }
        }
      } else {
        goodSince = null;
        if (holding) {
          if (badSince === null) badSince = timestamp;
          if (timestamp - badSince >= opts.graceMs) holding = false;
        }
      }

      const reps = Math.floor(heldMs / 1000);
      return {
        reps,
        phase: holding ? 'down' : 'up',
        repCompleted: reps > before,
        partialRep: false,
        issues: tracked ? issues : [ISSUES.LOST_TRACKING],
        tracking: tracked,
        holding,
        held: heldMs / 1000,
        thresholds: null,
      };
    },
  };
}

/**
 * The analyser around a hold engine: `measure(pose)` returns
 * { tracking, signal, issues, ...readings }.
 */
export function holdAnalyzer(exercise, opts, measure) {
  const engine = createHoldEngine(opts);
  return {
    exercise,
    hold: true,
    get reps() {
      return engine.reps;
    },
    get phase() {
      return engine.phase;
    },
    reset() {
      engine.reset();
    },
    push(pose, timestamp) {
      const frame = measure(pose);
      const result = engine.push(frame.tracking ? frame.issues : null, timestamp);
      return { ...frame, ...result, signal: Number.isFinite(frame.signal) ? frame.signal : null };
    },
  };
}

/* --- plank, side plank ----------------------------------------------------- */

/**
 * A plank side-on, a side plank facing the camera: either way the picture is
 * a straight body near horizontal with the weight on an arm. Checks: torso
 * within maxTilt of level, shoulder-hip-ankle straight (no sag, no pike), and
 * an elbow or wrist well below the shoulders, so lying flat on the floor is
 * not a plank.
 */
export const PLANK_DEFAULTS = {
  ...HOLD_BASE_DEFAULTS,
  maxTilt: 35,
  minBodyLine: 150,
  /** The lowest elbow or wrist, in torso lengths below the shoulders. */
  minArmSupport: 0.35,
};

export const SIDE_PLANK_DEFAULTS = { ...PLANK_DEFAULTS, maxTilt: 45 };

export function measurePlankFrame(pose, options = {}) {
  const opts = { ...PLANK_DEFAULTS, ...options };
  const none = { tracking: false, signal: null, issues: [], torsoTilt: null, bodyLine: null, support: null };
  if (!pose) return none;
  const line = midlineOf(pose, opts);
  const torsoTilt = torsoTiltOf(line, opts);
  const bodyLine = bodyLineOf(line, opts);
  if (torsoTilt === null || bodyLine === null) return none;
  const support = armSupportOf(pose, line, opts);
  const issues = [];
  if (torsoTilt > opts.maxTilt || !(support >= opts.minArmSupport)) issues.push(ISSUES.NOT_HORIZONTAL);
  if (bodyLine < opts.minBodyLine) issues.push(ISSUES.BODY_SAG);
  return { tracking: true, signal: bodyLine, issues, torsoTilt, bodyLine, support };
}

export function createPlankAnalyzer(options = {}, exercise = 'plank') {
  const base = exercise === 'sideplank' ? SIDE_PLANK_DEFAULTS : PLANK_DEFAULTS;
  const opts = { ...base, ...options };
  return holdAnalyzer(exercise, opts, (pose) => measurePlankFrame(pose, opts));
}

/* --- wall sit -------------------------------------------------------------- */

/**
 * Side-on, back against a wall, thighs level. Checks: the knee (hip-knee-ankle)
 * between minKnee and maxKnee — about 90 — and the torso upright.
 */
export const WALL_SIT_DEFAULTS = {
  ...HOLD_BASE_DEFAULTS,
  minKnee: 60,
  maxKnee: 120,
  minUprightTilt: 55,
};

export function measureWallSitFrame(pose, options = {}) {
  const opts = { ...WALL_SIT_DEFAULTS, ...options };
  const none = { tracking: false, signal: null, issues: [], knee: null, torsoTilt: null };
  if (!pose) return none;
  const knee = eitherSide(perSide((s) => sideAngle(pose, s, ['Hip', 'Knee', 'Ankle'], opts)), (l, r) => (l + r) / 2);
  if (knee === null) return none;
  const torsoTilt = torsoTiltOf(midlineOf(pose, opts), opts);
  const issues = [];
  if (knee > opts.maxKnee) issues.push(ISSUES.SHALLOW);
  else if (knee < opts.minKnee) issues.push(ISSUES.NOT_IN_POSITION);
  if (Number.isFinite(torsoTilt) && torsoTilt < opts.minUprightTilt) issues.push(ISSUES.NOT_UPRIGHT);
  return { tracking: true, signal: knee, issues, knee, torsoTilt };
}

export function createWallSitAnalyzer(options = {}) {
  const opts = { ...WALL_SIT_DEFAULTS, ...options };
  return holdAnalyzer('wallsit', opts, (pose) => measureWallSitFrame(pose, opts));
}

/* --- hollow hold, superman --------------------------------------------------- */

/**
 * Side-on, lying, with the shoulders and the legs both lifted off the floor and
 * the hips the low point: a banana shape on the back (hollow hold) or an arch
 * on the front (superman). The camera sees the same curve either way, so both
 * are this one check: torso and legs each lifted between minLift and maxLift
 * degrees, with the hips below both ends. Lying flat, either tilt is near 0;
 * sitting up, the torso is far past maxLift.
 */
export const ARCH_DEFAULTS = {
  ...HOLD_BASE_DEFAULTS,
  minLift: 8,
  maxLift: 50,
};

export const SUPERMAN_DEFAULTS = { ...ARCH_DEFAULTS, minLift: 5, maxLift: 40 };

export function measureArchFrame(pose, options = {}) {
  const opts = { ...ARCH_DEFAULTS, ...options };
  const none = { tracking: false, signal: null, issues: [], torsoTilt: null, legTilt: null };
  if (!pose) return none;
  const line = midlineOf(pose, opts);
  if (!line.shoulder || !line.hip || !line.ankle) return none;
  const torsoTilt = torsoTiltOf(line, opts);
  const legTilt = legTiltOf(line, opts);
  const lifted = (tilt) => tilt >= opts.minLift && tilt <= opts.maxLift;
  // Image y grows downward: the hips must be the lowest of the three.
  const hipsLowest = line.hip.y > line.shoulder.y && line.hip.y > line.ankle.y;
  const issues = lifted(torsoTilt) && lifted(legTilt) && hipsLowest ? [] : [ISSUES.NOT_IN_POSITION];
  return { tracking: true, signal: bodyLineOf(line, opts), issues, torsoTilt, legTilt };
}

export function createArchAnalyzer(options = {}, exercise = 'hollowhold') {
  const base = exercise === 'superman' ? SUPERMAN_DEFAULTS : ARCH_DEFAULTS;
  const opts = { ...base, ...options };
  return holdAnalyzer(exercise, opts, (pose) => measureArchFrame(pose, opts));
}

/* --- arm circles --------------------------------------------------------------- */

/**
 * Filmed from the front, standing, arms straight out to the sides at shoulder
 * height, circling. The circles themselves are small and fast — too small to
 * count one by one from a phone across the room — so the time with both arms
 * up and straight is what counts. Checks: both upper arms between minRaise and
 * maxRaise from the sides, both elbows straight, standing.
 */
export const ARM_CIRCLE_DEFAULTS = {
  ...HOLD_BASE_DEFAULTS,
  minRaise: 60,
  maxRaise: 125,
  minElbow: 140,
  minUprightTilt: 55,
};

export function measureArmCircleFrame(pose, options = {}) {
  const opts = { ...ARM_CIRCLE_DEFAULTS, ...options };
  const none = { tracking: false, signal: null, issues: [], raise: null, torsoTilt: null };
  if (!pose) return none;
  const raises = perSide((s) => sideAngle(pose, s, ['Hip', 'Shoulder', 'Elbow'], opts));
  const elbows = perSide((s) => sideAngle(pose, s, ['Shoulder', 'Elbow', 'Wrist'], opts));
  const low = bothSides(raises, Math.min);
  const high = bothSides(raises, Math.max);
  if (low === null) return none;
  const elbow = eitherSide(elbows, Math.min);
  const torsoTilt = torsoTiltOf(midlineOf(pose, opts), opts);
  const issues = [];
  if (low < opts.minRaise) issues.push(ISSUES.SHALLOW);
  else if (high > opts.maxRaise || (Number.isFinite(elbow) && elbow < opts.minElbow)) {
    issues.push(ISSUES.NOT_IN_POSITION);
  }
  if (Number.isFinite(torsoTilt) && torsoTilt < opts.minUprightTilt) issues.push(ISSUES.NOT_UPRIGHT);
  return { tracking: true, signal: low, issues, raise: low, torsoTilt };
}

export function createArmCircleAnalyzer(options = {}) {
  const opts = { ...ARM_CIRCLE_DEFAULTS, ...options };
  return holdAnalyzer('armcircles', opts, (pose) => measureArmCircleFrame(pose, opts));
}
