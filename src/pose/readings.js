import { allVisible, angleAt, distance, seenMidpoint, tiltFromHorizontal } from './geometry';

/**
 * Body readings the newer analysers share, so each of them is a few lines of
 * "which reading is the signal, and which gates apply" rather than another
 * copy of the same trigonometry.
 *
 * Everything is measured on the flat image, aspect-corrected (./geometry), and
 * is null when a joint it needs is not confident enough to trust. Side-on
 * readings (joint angles in the body's own plane) are only true from the side;
 * front-on exercises use heights and the arms' spread, which survive the
 * projection. Each exercise's hint says which way to face the phone.
 */

/** The rep engine's options every newer rep analyser starts from. */
export const REP_BASE_DEFAULTS = {
  autoCalibrate: true,
  calibrationWindowMs: 20000,
  minRangeDeg: 25,
  rangeFraction: 0.3,
  minVisibility: 0.4,
  minPhaseMs: 150,
  minRepMs: 500,
  aspect: 1,
};

/**
 * Interior angle at the middle of three joints on one side, e.g.
 * sideAngle(pose, 'left', ['Hip', 'Knee', 'Ankle'], opts) is the left knee.
 */
export function sideAngle(pose, side, parts, opts) {
  const joints = parts.map((part) => side + part);
  if (!allVisible(pose, joints, opts.minVisibility)) return null;
  const [a, b, c] = joints.map((j) => pose[j]);
  return angleAt(a, b, c, opts.aspect);
}

/** A reading taken on each side: { left, right }. */
export function perSide(read) {
  return { left: read('left'), right: read('right') };
}

/** Combine a left/right pair when both are known; null otherwise. */
export function bothSides(pair, pick) {
  return Number.isFinite(pair.left) && Number.isFinite(pair.right) ? pick(pair.left, pair.right) : null;
}

/**
 * Combine a left/right pair from whichever sides are known: side-on, the far
 * limb is often hidden behind the body, and the near one alone is enough.
 */
export function eitherSide(pair, pick) {
  const l = Number.isFinite(pair.left);
  const r = Number.isFinite(pair.right);
  if (l && r) return pick(pair.left, pair.right);
  if (l) return pair.left;
  if (r) return pair.right;
  return null;
}

/**
 * Angle of the segment a->b away from straight down, in degrees (0..180):
 * 0 hanging, 90 level, 180 straight up. Null when an end is missing.
 */
export function angleFromDown(a, b, aspect = 1) {
  if (!a || !b) return null;
  const dx = (b.x - a.x) * aspect;
  const dy = b.y - a.y; // image y grows downward
  if (dx === 0 && dy === 0) return null;
  return (Math.atan2(Math.abs(dx), dy) * 180) / Math.PI;
}

/** Mid-shoulder, mid-hip, mid-knee and mid-ankle, from confident joints only. */
export function midlineOf(pose, opts) {
  const mid = (joint) => seenMidpoint(pose, 'left' + joint, 'right' + joint, opts.minVisibility);
  return { shoulder: mid('Shoulder'), hip: mid('Hip'), knee: mid('Knee'), ankle: mid('Ankle'), wrist: mid('Wrist') };
}

/** Torso against the horizontal (0 lying or in a plank, 90 standing). */
export function torsoTiltOf(line, opts) {
  return tiltFromHorizontal(line.shoulder, line.hip, opts.aspect);
}

/** Hip-to-ankle against the horizontal (0 legs along the floor, 90 standing on them). */
export function legTiltOf(line, opts) {
  return tiltFromHorizontal(line.hip, line.ankle || line.knee, opts.aspect);
}

/** Shoulder-hip-ankle angle: 180 a straight body, smaller as it folds at the hips. */
export function bodyLineOf(line, opts) {
  return angleAt(line.shoulder, line.hip, line.ankle || line.knee, opts.aspect);
}

/** Shoulder-to-hip length on the image; the scale for distances on the body. */
export function torsoLengthOf(line, opts) {
  const length = distance(line.shoulder, line.hip, opts.aspect);
  return length > 0 ? length : null;
}

/**
 * How far below the shoulders the lower of the elbows and wrists sits, in
 * torso lengths: about 0.6 with the weight on the arms (plank, all fours),
 * near 0 with the arms lying along the floor.
 */
export function armSupportOf(pose, line, opts) {
  const torso = torsoLengthOf(line, opts);
  if (!torso || !line.shoulder) return null;
  let lowest = null;
  for (const joint of ['leftElbow', 'rightElbow', 'leftWrist', 'rightWrist']) {
    const p = pose[joint];
    if (p && p.score >= opts.minVisibility && (lowest === null || p.y > lowest)) lowest = p.y;
  }
  return lowest === null ? null : (lowest - line.shoulder.y) / torso;
}
