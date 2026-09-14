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
  /** Elbow angle at or below which the arms count as bent (bottom). */
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

      // Instantaneous reading; null in the hysteresis band, where we hold.
      let observed = null;
      if (elbow <= opts.downAngle) observed = 'down';
      else if (elbow >= opts.upAngle) observed = 'up';

      let repCompleted = false;
      let partialRep = false;
      const issues = [];

      // Shallow-dip detection, before the phase machine. Bending to 130 and
      // coming back never crosses a threshold, so the machine sees nothing —
      // but "go lower" is exactly the feedback that moment calls for.
      if (phase === 'up') {
        if (elbow < opts.upAngle) {
          inDip = true;
          dipMin = Math.min(dipMin, elbow);
        } else if (inDip) {
          const wasShallow = dipMin <= opts.partialAngle;
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
      });
    },
  };
}
