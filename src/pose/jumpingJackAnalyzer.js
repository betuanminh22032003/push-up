import { allVisible, angleAt, distance, seenMidpoint, tiltFromHorizontal } from './geometry';
import { ISSUES, createRepEngine, poseAnalyzer } from './repEngine';

/**
 * Counts jumping jacks from a stream of pose frames, filmed from the front.
 *
 * The signal is the arm gap: how many degrees the upper arm is short of
 * pointing straight up along the torso — about 165 hanging at the sides, 15
 * overhead. It is 180 minus the arm's raise at the shoulder (hip-shoulder-
 * elbow), so it falls with the effort like the push-up's elbow.
 *
 * The upper arm rather than the whole arm: overhead, the hands are the first
 * thing to leave the frame of a phone propped a couple of metres away, and the
 * elbows are not. It also ignores the forearm, so a hand waved from a bent
 * elbow raises nothing.
 *
 * Both arms must be seen, and the lower one is the signal. A jumping jack
 * raises both; waving one arm overhead leaves the other at the side, so the
 * signal stays at rest and nothing counts.
 *
 * Gate: standing. The rep's most upright frame must have the torso within
 * minUprightTilt of vertical, so the same arm sweep lying on the floor (a snow
 * angel) counts nothing.
 *
 * The legs are measured (legSpread) but neither gate nor veto a rep. The ankles
 * are the joints tracked worst and the first cut off by a phone propped close,
 * and a veto on an unreliable reading is how a full set of real push-ups once
 * counted zero (see requireStraightBody in ./pushupAnalyzer).
 */

export const JUMPING_JACK_DEFAULTS = {
  /** Adapt the thresholds to the observed range; see the push-up's DEFAULTS. */
  autoCalibrate: true,
  calibrationWindowMs: 20000,
  /** Movement smaller than this is not a rep, it is noise or fidgeting. */
  minRangeDeg: 25,
  /**
   * Wider than the other exercises. A jack's range is huge (about 165
   * degrees), so 30% of it put the effort threshold within 52 degrees of
   * overhead, which brisk arms pass through in under 100ms. At 40% the
   * absolute limits below decide instead.
   */
  rangeFraction: 0.4,
  /**
   * Absolute limits the adapted thresholds may not cross: the arms must get
   * within 60 degrees of straight up, and come back down to just under
   * shoulder level (80 degrees from the sides). No stricter: at 10fps, where a
   * cheap phone on the CPU delegate runs, brisk jacks at two a second leave
   * the arms below 60 degrees from the sides for a single frame, and a phase
   * one frame long can never be committed, so two jacks merged into one and a
   * third of them went uncounted.
   */
  downAngleCeiling: 60,
  upAngleFloor: 100,

  /** Fallback thresholds, until a range is known (or with autoCalibrate off). */
  downAngle: 50,
  upAngle: 130,
  /**
   * A dip that got within (upAngle - partialAngle) of the down threshold but
   * never crossed it is a jack with the arms only to shoulder height, reported
   * as shallow. Arms swinging while walking stay well clear of it.
   */
  partialAngle: 85,
  minVisibility: 0.4,
  /**
   * Shorter than the other exercises: at a brisk two a second the arms spend
   * under 200ms past either threshold, and a phone on the CPU delegate sees
   * that as two or three frames; 150, or even 80, dropped real reps at 15fps.
   * Still three frames in a row at 30fps (two at 15), so a single bad
   * inference cannot commit a phase.
   */
  minPhaseMs: 60,
  /** A brisk jumping jack takes about 0.6s; see src/exercises/exercises.js. */
  minRepMs: 350,
  /** The torso must be at least this many degrees off horizontal at some point in the rep. */
  minUprightTilt: 55,
  /** Frame aspect ratio (width / height) for angle correction. */
  aspect: 1,
};

const JACK_ARMS = {
  left: ['leftHip', 'leftShoulder', 'leftElbow'],
  right: ['rightHip', 'rightShoulder', 'rightElbow'],
};

/** Degrees one upper arm is short of straight overhead. */
function jackArmGap(pose, side, opts) {
  const joints = JACK_ARMS[side];
  if (!allVisible(pose, joints, opts.minVisibility)) return null;
  const [hip, shoulder, elbow] = joints.map((j) => pose[j]);
  const raise = angleAt(hip, shoulder, elbow, opts.aspect);
  return raise === null ? null : 180 - raise;
}

/** Measure one frame without any state. */
export function measureJumpingJackFrame(pose, options = {}) {
  const opts = { ...JUMPING_JACK_DEFAULTS, ...options };
  if (!pose) return { tracking: false, armGap: null, torsoTilt: null, legSpread: null };

  const left = jackArmGap(pose, 'left', opts);
  const right = jackArmGap(pose, 'right', opts);
  const armGap = left !== null && right !== null ? Math.max(left, right) : null;

  const shoulder = seenMidpoint(pose, 'leftShoulder', 'rightShoulder', opts.minVisibility);
  const hip = seenMidpoint(pose, 'leftHip', 'rightHip', opts.minVisibility);
  const torsoTilt = tiltFromHorizontal(shoulder, hip, opts.aspect);

  // Feet apart, in torso lengths: about 0.5 together, 1.5 or more out.
  let legSpread = null;
  if (shoulder && hip && allVisible(pose, ['leftAnkle', 'rightAnkle'], opts.minVisibility)) {
    const torso = distance(shoulder, hip, opts.aspect);
    if (torso > 0) legSpread = distance(pose.leftAnkle, pose.rightAnkle, opts.aspect) / torso;
  }

  return { tracking: armGap !== null, armGap, torsoTilt, legSpread };
}

export function createJumpingJackAnalyzer(options = {}) {
  const opts = { ...JUMPING_JACK_DEFAULTS, ...options };

  const engine = createRepEngine(opts, [
    {
      // Judged on the rep's most upright frame, like the squat's.
      read: (frame) => frame.torsoTilt,
      keep: 'max',
      fails: (tilt) => tilt < opts.minUprightTilt,
      issue: ISSUES.NOT_UPRIGHT,
      veto: true,
    },
  ]);

  return poseAnalyzer('jumpingjack', engine, (pose) => measureJumpingJackFrame(pose, opts), 'armGap');
}
