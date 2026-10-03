import { allVisible, angleAt, meanDefined, torsoTiltFromHorizontal } from './geometry';
import { ISSUES, createRepEngine, poseAnalyzer } from './repEngine';

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
 * The counting itself is ./repEngine, shared with the other exercises; this
 * file decides what to measure and which form gates apply.
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
  /**
   * Whether bad body position *rejects* a rep rather than just warning.
   *
   * Off by default, because the measurement is not trustworthy enough to
   * refuse work over. The shoulder-hip-knee angle is read off a flat image, so
   * foreshortening from any camera not square to the body pulls it well below
   * 150 degrees even when the person is perfectly straight — the same
   * projection problem that made fixed elbow thresholds fail. Rejecting on it
   * meant a full set of real push-ups counted zero. The issue is still
   * reported, so the coaching is unchanged; only the veto is gone.
   */
  requireStraightBody: false,
  /**
   * Torso must get within this many degrees of horizontal at some point in the
   * rep. Judged on the best frame of the rep, not every frame: a single noisy
   * inference used to veto an otherwise good rep.
   */
  maxTorsoTilt: 55,
  /** Frame aspect ratio (width / height) for angle correction. */
  aspect: 1,
};

/**
 * The shared vocabulary (./repEngine), re-exported for code written when this
 * was the only analyser. New code imports it from ./analyzers.
 */
export { ISSUES };

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

  const engine = createRepEngine(opts, [
    {
      // Reported on every rep, but only refuses one when asked to: see
      // requireStraightBody for why the measurement cannot be trusted with a
      // veto by default.
      read: (frame) => frame.body,
      keep: 'min',
      fails: (body) => body < opts.straightBodyMinAngle,
      issue: ISSUES.BODY_SAG,
      veto: opts.requireStraightBody,
    },
    {
      // Not being in a push-up position at all. The rep's most horizontal
      // frame decides (see maxTorsoTilt), not its worst.
      read: (frame) => frame.torsoTilt,
      keep: 'min',
      fails: (tilt) => tilt > opts.maxTorsoTilt,
      issue: ISSUES.NOT_HORIZONTAL,
      veto: true,
    },
  ]);

  return poseAnalyzer('pushup', engine, (pose) => measureFrame(pose, opts), 'elbow');
}
