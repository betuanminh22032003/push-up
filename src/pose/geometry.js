/**
 * Geometry helpers over normalised pose landmarks.
 *
 * Landmarks arrive normalised per axis (x and y both 0..1), which silently
 * distorts angles on any non-square frame: on a 16:9 image one unit of x is
 * 1.78x wider than one unit of y, so an arm at a true 90 degrees measures as
 * something else. Every function here takes the frame's aspect ratio
 * (width / height) and restores real proportions before measuring.
 */

/** Euclidean distance, aspect-corrected. */
export function distance(a, b, aspect = 1) {
  if (!a || !b) return null;
  const dx = (a.x - b.x) * aspect;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/**
 * Interior angle at vertex `b`, in degrees (0..180), between rays b->a and b->c.
 * Returns null if any point is missing or two points coincide.
 */
export function angleAt(a, b, c, aspect = 1) {
  if (!a || !b || !c) return null;

  const abx = (a.x - b.x) * aspect;
  const aby = a.y - b.y;
  const cbx = (c.x - b.x) * aspect;
  const cby = c.y - b.y;

  const magAB = Math.hypot(abx, aby);
  const magCB = Math.hypot(cbx, cby);
  if (magAB === 0 || magCB === 0) return null;

  const cosine = (abx * cbx + aby * cby) / (magAB * magCB);
  // Floating point can push the quotient a hair outside acos's domain.
  return (Math.acos(Math.min(1, Math.max(-1, cosine))) * 180) / Math.PI;
}

/** True when every joint named is present and confident enough. */
export function allVisible(pose, joints, minVisibility) {
  return joints.every((j) => pose[j] && pose[j].score >= minVisibility);
}

/** Mean of the values that are actually numbers; null when none are. */
export function meanDefined(values) {
  const defined = values.filter((v) => Number.isFinite(v));
  if (defined.length === 0) return null;
  return defined.reduce((sum, v) => sum + v, 0) / defined.length;
}

/**
 * Angle of the torso against the horizontal, in degrees (0..90).
 *
 * A push-up is performed roughly horizontal. A near-vertical torso means the
 * subject is standing, so whatever the arms are doing is not a push-up — this
 * is what stops arm-waving at the camera from running up a count.
 */
export function torsoTiltFromHorizontal(pose, aspect = 1) {
  const shoulder = midpoint(pose.leftShoulder, pose.rightShoulder, aspect);
  const hip = midpoint(pose.leftHip, pose.rightHip, aspect);
  if (!shoulder || !hip) return null;

  const dx = Math.abs(shoulder.x - hip.x) * aspect;
  const dy = Math.abs(shoulder.y - hip.y);
  if (dx === 0 && dy === 0) return null;

  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/** Midpoint of two joints; falls back to whichever one exists. */
export function midpoint(a, b) {
  if (a && b) return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, score: Math.min(a.score, b.score) };
  return a || b || null;
}
