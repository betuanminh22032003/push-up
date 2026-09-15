import { allVisible, angleAt, meanDefined, torsoTiltFromHorizontal } from './geometry';

/**
 * Counts push-ups from a stream of pose frames.
 *
 * The signal is the elbow angle (shoulder-elbow-wrist): ~170 degrees at the top
 * of a push-up, ~80 at the bottom. A rep is one down-then-up cycle, counted on
 * the way back up so the number matches completed reps rather than attempts —
 * the same rule the proximity path uses.
 *
 * Four things keep the count honest:
 *
 *   hysteresis     separate down/up thresholds, so an angle hovering on one
 *                  boundary cannot oscillate and inflate the count
 *   minPhaseMs     a phase must hold before it is committed, rejecting jitter
 *                  from a single bad inference
 *   minRepMs       the same 500ms floor between reps used elsewhere
 *   form gates     torso must be roughly horizontal and the body straight,
 *                  so arm-waving at the camera counts nothing
 *
 * The analyser is pure and deterministic: same frames in, same reps out, with
 * all timing taken from the caller's timestamps rather than the clock. That is
 * what makes it testable without a camera.
 */

export const DEFAULTS = {
  /**
   * Adapt the thresholds to the range of movement actually observed.
   *
   * Fixed angles do not survive the projection: the elbow angle is measured on
   * a flat image, so a camera off the plane of the arm flattens it. Someone
   * going properly to the floor can measure 115 degrees, never cross a fixed
   * 100-degree threshold, and get no reps and no explanation. Deriving the
   * thresholds from each person's own observed range removes that failure,
   * and removes the per-setup tuning it would otherwise need.
   */
  autoCalibrate: true,
  /** How far back the observed range is measured. */
  calibrationWindowMs: 20000,
  /** Movement smaller than this is not a rep, it is noise or fidgeting. */
  minRangeDeg: 25,
  /** Where in the observed range the down/up thresholds sit. */
  rangeFraction: 0.3,
  /**
   * Absolute limits the adapted thresholds may not cross. Without these,
   * adapting to a tiny range would make a shallow twitch count as a full rep —
   * the arms still have to actually bend.
   */
  downAngleCeiling: 120,
  upAngleFloor: 140,

  /** Fallback thresholds, used until a range is known (or with autoCalibrate off). */
  downAngle: 100,
  /** Elbow angle at or above which the arms count as extended (top). */
  upAngle: 150,
  /** A dip past this that never reaches downAngle is a partial rep. */
  partialAngle: 135,
  /** Minimum landmark confidence before a joint is trusted. */
  minVisibility: 0.4,
  /** How long a phase must hold before it is committed. */
  minPhaseMs: 150,
  /** Minimum gap between two counted reps. */
  minRepMs: 500,
  /** Shoulder-hip-knee angle below which the body is sagging or piking. */
  straightBodyMinAngle: 150,
  /** Reject reps performed with a bent body. */
  requireStraightBody: true,
  /** Torso must be within this many degrees of horizontal. */
  maxTorsoTilt: 45,
  /** Frame aspect ratio (width / height) for angle correction. */
  aspect: 1,
};

export const ISSUES = {
  SHALLOW: 'shallow',
  BODY_SAG: 'bodySag',
  NOT_HORIZONTAL: 'notHorizontal',
  LOST_TRACKING: 'lostTracking',
};

const ARM_JOINTS = {
  left: ['leftShoulder', 'leftElbow', 'leftWrist'],
  right: ['rightShoulder', 'rightElbow', 'rightWrist'],
};

const BODY_JOINTS = {
  left: ['leftShoulder', 'leftHip', 'leftKnee'],
  right: ['rightShoulder', 'rightHip', 'rightKnee'],
};

function elbowAngle(pose, side, opts) {
  const joints = ARM_JOINTS[side];
  if (!allVisible(pose, joints, opts.minVisibility)) return null;
  const [shoulder, elbow, wrist] = joints.map((j) => pose[j]);
  return angleAt(shoulder, elbow, wrist, opts.aspect);
}

function bodyAngle(pose, side, opts) {
  const joints = BODY_JOINTS[side];
  if (!allVisible(pose, joints, opts.minVisibility)) return null;
  const [shoulder, hip, knee] = joints.map((j) => pose[j]);
  return angleAt(shoulder, hip, knee, opts.aspect);
}

/**
 * Measure one frame without any state. Exported so the UI can show live angles
 * and so the thresholds can be inspected in isolation.
 */
export function measureFrame(pose, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  if (!pose) return { tracking: false, elbow: null, body: null, torsoTilt: null };

  const elbow = meanDefined([elbowAngle(pose, 'left', opts), elbowAngle(pose, 'right', opts)]);
  const body = meanDefined([bodyAngle(pose, 'left', opts), bodyAngle(pose, 'right', opts)]);
  const torsoTilt = torsoTiltFromHorizontal(pose, opts.aspect);

  return { tracking: elbow !== null, elbow, body, torsoTilt };
}

export function createPushupAnalyzer(options = {}) {
  const opts = { ...DEFAULTS, ...options };

  let phase = 'unknown'; // 'unknown' | 'up' | 'down'
  let reps = 0;
  let lastRepAt = -Infinity;

  let candidate = null; // phase we are waiting to confirm
  let candidateSince = 0;

  // Per-rep accumulators, reset when a descent begins.
  let minElbowInRep = Infinity;
  let worstBodyInRep = Infinity;
  let sawNotHorizontal = false;

  // A dip taken while still in the 'up' phase, i.e. one that never got deep
  // enough to commit a descent. Tracked outside the phase machine because a
  // shallow dip produces no phase change for the machine to react to.
  let inDip = false;
  let dipMin = Infinity;

  /** Recent elbow angles, for deriving this person's range of movement. */
  let samples = [];

  /**
   * Thresholds for the current frame: adapted to the observed range once there
   * is enough of it, otherwise the fixed fallbacks. Clamped so a small range
   * cannot turn a twitch into a rep.
   */
  function thresholdsFor(elbow, timestamp) {
    if (!opts.autoCalibrate) {
      return { down: opts.downAngle, up: opts.upAngle, adapted: false };
    }

    samples.push({ t: timestamp, elbow });
    const cutoff = timestamp - opts.calibrationWindowMs;
    if (samples.length > 4 && samples[0].t < cutoff) {
      samples = samples.filter((s) => s.t >= cutoff);
    }

    let min = Infinity;
    let max = -Infinity;
    for (const s of samples) {
      if (s.elbow < min) min = s.elbow;
      if (s.elbow > max) max = s.elbow;
    }

    const range = max - min;
    if (!Number.isFinite(range) || range < opts.minRangeDeg) {
      return { down: opts.downAngle, up: opts.upAngle, adapted: false };
    }

    const margin = range * opts.rangeFraction;
    return {
      down: Math.min(min + margin, opts.downAngleCeiling),
      up: Math.max(max - margin, opts.upAngleFloor),
      adapted: true,
      observedMin: min,
      observedMax: max,
    };
  }

  function resetRepAccumulators() {
    minElbowInRep = Infinity;
    worstBodyInRep = Infinity;
    sawNotHorizontal = false;
  }

  function clearDip() {
    inDip = false;
    dipMin = Infinity;
  }

  function result(extra) {
    return {
      reps,
      phase,
      repCompleted: false,
      partialRep: false,
      issues: [],
      elbow: null,
      body: null,
      torsoTilt: null,
      tracking: false,
      thresholds: null,
      ...extra,
    };
  }

  return {
    get reps() {
      return reps;
    },

    get phase() {
      return phase;
    },

    reset() {
      phase = 'unknown';
      reps = 0;
      lastRepAt = -Infinity;
      candidate = null;
      candidateSince = 0;
      samples = [];
      clearDip();
      resetRepAccumulators();
    },

    /**
     * Feed one pose frame.
     * @param {object} pose       normalised joints (see ./landmarks)
     * @param {number} timestamp  milliseconds, monotonic
     */
    push(pose, timestamp) {
      const { tracking, elbow, body, torsoTilt } = measureFrame(pose, opts);

      if (!tracking) {
        // Hold the phase rather than guessing: a dropped frame mid-descent
        // must not be read as the subject having come back up.
        candidate = null;
        return result({
          tracking: false,
          issues: [ISSUES.LOST_TRACKING],
          elbow,
          body,
          torsoTilt,
        });
      }

      const horizontal = torsoTilt === null || torsoTilt <= opts.maxTorsoTilt;
      if (!horizontal) sawNotHorizontal = true;

      minElbowInRep = Math.min(minElbowInRep, elbow);
      if (Number.isFinite(body)) worstBodyInRep = Math.min(worstBodyInRep, body);

      const limits = thresholdsFor(elbow, timestamp);

      // Instantaneous reading; null in the hysteresis band, where we hold.
      let observed = null;
      if (elbow <= limits.down) observed = 'down';
      else if (elbow >= limits.up) observed = 'up';

      let repCompleted = false;
      let partialRep = false;
      const issues = [];

      // Shallow-dip detection, before the phase machine. Bending to 130 and
      // coming back never crosses a threshold, so the machine sees nothing —
      // but "go lower" is exactly the feedback that moment calls for.
      if (phase === 'up') {
        if (elbow < limits.up) {
          inDip = true;
          dipMin = Math.min(dipMin, elbow);
        } else if (inDip) {
          // "Too shallow to count" is relative to where the down threshold
          // actually sits, so the advice stays honest under adaptation.
          const wasShallow = dipMin <= limits.down + (opts.upAngle - opts.partialAngle);
          clearDip();
          if (wasShallow) {
            partialRep = true;
            issues.push(ISSUES.SHALLOW);
          }
        }
      }

      if (observed && observed !== phase) {
        if (candidate !== observed) {
          candidate = observed;
          candidateSince = timestamp;
        }

        if (timestamp - candidateSince >= opts.minPhaseMs) {
          const previous = phase;
          phase = observed;
          candidate = null;

          if (phase === 'down') {
            // A real descent supersedes any dip we were tracking, so it must
            // not also be reported as a shallow rep on the way back up.
            clearDip();
            resetRepAccumulators();
            minElbowInRep = elbow;
            if (Number.isFinite(body)) worstBodyInRep = body;
            if (!horizontal) sawNotHorizontal = true;
          }

          if (phase === 'up' && previous === 'down') {
            // A full cycle finished. Decide whether it earns a count.
            if (sawNotHorizontal) {
              issues.push(ISSUES.NOT_HORIZONTAL);
            } else if (
              opts.requireStraightBody &&
              Number.isFinite(worstBodyInRep) &&
              worstBodyInRep < opts.straightBodyMinAngle
            ) {
              issues.push(ISSUES.BODY_SAG);
            } else if (timestamp - lastRepAt >= opts.minRepMs) {
              reps += 1;
              lastRepAt = timestamp;
              repCompleted = true;
            }
            clearDip();
            resetRepAccumulators();
          }
        }
      } else if (observed === phase) {
        candidate = null;
      }

      return result({
        tracking: true,
        phase,
        reps,
        repCompleted,
        partialRep,
        issues,
        elbow,
        body,
        torsoTilt,
        thresholds: limits,
      });
    },
  };
}
