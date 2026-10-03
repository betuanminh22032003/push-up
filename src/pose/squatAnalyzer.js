import { allVisible, distance, meanDefined, seenMidpoint, tiltFromHorizontal } from './geometry';
import { ISSUES, createRepEngine, poseAnalyzer } from './repEngine';

/**
 * Counts squats from a stream of pose frames.
 *
 * The obvious signal, the hip-knee-ankle angle, only works side-on. A camera
 * facing the person sees the knee bend almost entirely in depth: the thigh
 * swings toward the lens, and on the flat image the leg stays a straight line
 * from hip to ankle all the way down. The same projection problem that made
 * fixed push-up thresholds fail, only total — a front-on squat would read
 * 170 degrees at the bottom.
 *
 * What survives the projection is height. Turning the body, or the camera,
 * about the vertical axis moves joints sideways and in depth, never up or
 * down. The signal is how high the hip sits above the ankle, as a share of
 * its height standing: 1 standing, about 0.4 with the thighs level. The
 * signal turns that back into an angle on the knee's own scale — 180
 * standing, about 90 at parallel — so it behaves like the push-up's elbow and
 * the thresholds read like knee angles.
 *
 * Hip and ankle, not the knee. A real camera is not orthographic: a joint
 * nearer the lens is drawn larger, so it moves on the image as it moves in
 * depth. The knee is the joint that travels toward a camera in front, and an
 * earlier version that measured how far the knee sat below the hip misread
 * parallel squats by 30 degrees or more depending on how high the phone stood
 * — at hip height, real parallel squats never counted, and with the phone on
 * the floor half squats did. The ankles do not move at all, and the hips
 * travel back by a fraction of the distance to the phone, so their height
 * barely changes with where the camera is.
 *
 * Standing height is the tallest the hip has stood over the calibration
 * window, per leg, so it follows the person stepping closer or further away.
 * Turning the share into an angle assumes thigh and shin of about the same
 * length, the shin tipping forward about 0.4 as far as the thigh — what a
 * bodyweight squat does. A deeper or shallower shin than that moves the
 * reading by a few degrees, far less than the band between the thresholds.
 *
 * Both legs are averaged. A squat bends both; walking and high knees bend one
 * at a time, so the average stays near standing.
 *
 * Gate: standing. The rep's most upright frame must have the torso within
 * minUprightTilt of vertical, so a plank with the knees tucked and kicked back
 * (the legs of a burpee) counts nothing.
 */

export const SQUAT_DEFAULTS = {
  /** Adapt the thresholds to the observed range; see the push-up's DEFAULTS. */
  autoCalibrate: true,
  calibrationWindowMs: 20000,
  /** Movement smaller than this is not a rep, it is noise or fidgeting. */
  minRangeDeg: 25,
  rangeFraction: 0.3,
  /**
   * Absolute limits the adapted thresholds may not cross: the thighs must get
   * within 30 degrees of level, and the person must stand back up to within
   * 35 degrees of straight.
   */
  downAngleCeiling: 120,
  upAngleFloor: 145,

  /** Fallback thresholds, until a range is known (or with autoCalibrate off). */
  downAngle: 115,
  upAngle: 155,
  /**
   * A dip that got within (upAngle - partialAngle) of the down threshold but
   * never crossed it is a half squat, reported as shallow. Smaller dips are
   * just walking.
   */
  partialAngle: 130,
  minVisibility: 0.4,
  minPhaseMs: 150,
  minRepMs: 500,
  /** The torso must be at least this many degrees off horizontal at some point in the rep. */
  minUprightTilt: 55,
  /** Frame aspect ratio (width / height) for angle correction. */
  aspect: 1,
};

const SQUAT_LEGS = {
  left: ['leftHip', 'leftKnee', 'leftAnkle'],
  right: ['rightHip', 'rightKnee', 'rightAnkle'],
};

/**
 * The hip's height above the ankle, as a share of standing, at a given thigh
 * angle from vertical: thigh and shin taken as equal halves of it, the shin
 * tipping forward SHIN_FOLLOW as far as the thigh.
 */
const SHIN_FOLLOW = 0.4;
function heightShareAt(thighDeg) {
  const r = (thighDeg * Math.PI) / 180;
  return 0.5 * Math.cos(r) + 0.5 * Math.cos(SHIN_FOLLOW * r);
}

/** The deepest thigh angle the signal reports, well past any real squat. */
const DEEPEST_THIGH = 150;

/** Thigh angle from vertical for a height share: the inverse of heightShareAt. */
function thighFromShare(share) {
  if (share >= 1) return 0;
  if (share <= heightShareAt(DEEPEST_THIGH)) return DEEPEST_THIGH;
  // heightShareAt falls steadily over 0..DEEPEST_THIGH, so bisection is exact
  // enough after a couple of dozen halvings.
  let lo = 0;
  let hi = DEEPEST_THIGH;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (heightShareAt(mid) > share) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * One leg as drawn: how high the hip sits above the ankle (image y grows
 * downward), and the leg's drawn length, which is its true length side-on.
 */
function legOf(pose, side, opts) {
  const joints = SQUAT_LEGS[side];
  if (!allVisible(pose, joints, opts.minVisibility)) return null;
  const [hip, knee, ankle] = joints.map((j) => pose[j]);
  return {
    height: ankle.y - hip.y,
    length: distance(hip, knee, opts.aspect) + distance(knee, ankle, opts.aspect),
  };
}

/** One leg's knee angle, estimated from the hip's height against `standing`. */
function squatKneeAngle(leg, standing) {
  if (!leg) return null;
  // Without a standing height yet, the leg's own drawn length: exact side-on,
  // and a stateless reading of a single frame needs something.
  const reference = Math.max(standing || leg.length, leg.height);
  if (!(reference > 0)) return null;
  return 180 - thighFromShare(leg.height / reference);
}

/**
 * Measure one frame. `standing` is each leg's hip height standing,
 * { left, right }, as the analyser tracks it; left out, the frame is read on
 * its own, which is only right side-on.
 */
export function measureSquatFrame(pose, options = {}, standing = null) {
  const opts = { ...SQUAT_DEFAULTS, ...options };
  if (!pose) return { tracking: false, knee: null, torsoTilt: null, hipHeight: null };

  const left = legOf(pose, 'left', opts);
  const right = legOf(pose, 'right', opts);
  const knee = meanDefined([
    squatKneeAngle(left, standing && standing.left),
    squatKneeAngle(right, standing && standing.right),
  ]);
  const torsoTilt = tiltFromHorizontal(
    seenMidpoint(pose, 'leftShoulder', 'rightShoulder', opts.minVisibility),
    seenMidpoint(pose, 'leftHip', 'rightHip', opts.minVisibility),
    opts.aspect,
  );

  return {
    tracking: knee !== null,
    knee,
    torsoTilt,
    hipHeight: { left: left ? left.height : null, right: right ? right.height : null },
  };
}

/**
 * The largest value pushed over the last `windowMs`: a queue kept falling
 * from front to back, so each frame costs next to nothing.
 */
function windowMax(windowMs) {
  let queue = [];
  return {
    max(t) {
      while (queue.length && queue[0].t < t - windowMs) queue.shift();
      return queue.length ? queue[0].value : null;
    },
    push(value, t) {
      if (!Number.isFinite(value)) return;
      while (queue.length && queue[queue.length - 1].value <= value) queue.pop();
      queue.push({ t, value });
    },
    reset() {
      queue = [];
    },
  };
}

export function createSquatAnalyzer(options = {}) {
  const opts = { ...SQUAT_DEFAULTS, ...options };

  const engine = createRepEngine(opts, [
    {
      // Judged on the rep's most upright frame: the torso leans forward at
      // the bottom of any squat, and one bad inference must not cost a rep.
      // A torso out of frame passes: a phone propped low often cuts off the
      // shoulders, and unknown is not wrong.
      read: (frame) => frame.torsoTilt,
      keep: 'max',
      fails: (tilt) => tilt < opts.minUprightTilt,
      issue: ISSUES.NOT_UPRIGHT,
      veto: true,
    },
  ]);

  const standing = { left: windowMax(opts.calibrationWindowMs), right: windowMax(opts.calibrationWindowMs) };
  const measure = (pose, timestamp) => {
    const frame = measureSquatFrame(pose, opts, {
      left: standing.left.max(timestamp),
      right: standing.right.max(timestamp),
    });
    if (frame.hipHeight) {
      standing.left.push(frame.hipHeight.left, timestamp);
      standing.right.push(frame.hipHeight.right, timestamp);
    }
    return frame;
  };
  const reset = () => {
    standing.left.reset();
    standing.right.reset();
  };

  return poseAnalyzer('squat', engine, measure, 'knee', reset);
}
