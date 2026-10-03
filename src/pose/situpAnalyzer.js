import { angleAt, seenMidpoint, tiltFromHorizontal } from './geometry';
import { ISSUES, createRepEngine, poseAnalyzer } from './repEngine';

/**
 * Counts sit-ups from a stream of pose frames, filmed from the side.
 *
 * The signal is the trunk angle: the angle at the hip between the torso and
 * the floor on the feet's side. Lying flat it is 180, sitting upright 90, chest
 * to the knees about 60, so it falls with the effort like the push-up's elbow.
 *
 * It is the hip angle (shoulder-hip-knee) with the thigh replaced by the
 * floor, deliberately. The real hip angle mixes two things: how far the torso
 * came up, and how sharply the knees are bent — feet a little closer to the
 * seat and a crunch reads like a full sit-up. Measuring against the floor
 * leaves only the first, which is what "came up high enough" means. Which way
 * the floor runs is read off the ankles, so the side the person lies on, or a
 * mirrored preview, changes nothing.
 *
 * Gate: lying. A rep must start from lying on the back — torso and legs both
 * near the floor in the rest before it. Judged on that rest, not on the rep:
 * a rep always ends lying back, so its own frames would pass a person who
 * stood, sat down and lay back. Standing, bowing, or sitting on a chair, the
 * legs are never flat, so none of it counts.
 */

export const SITUP_DEFAULTS = {
  /** Adapt the thresholds to the observed range; see the push-up's DEFAULTS. */
  autoCalibrate: true,
  calibrationWindowMs: 20000,
  /** Movement smaller than this is not a rep, it is noise or fidgeting. */
  minRangeDeg: 25,
  rangeFraction: 0.3,
  /**
   * Absolute limits the adapted thresholds may not cross: the torso must come
   * at least 55 degrees off the floor, and go back down to within 35 of it.
   */
  downAngleCeiling: 125,
  upAngleFloor: 145,

  /** Fallback thresholds, until a range is known (or with autoCalibrate off). */
  downAngle: 120,
  upAngle: 155,
  /**
   * A dip that got within (upAngle - partialAngle) of the down threshold but
   * never crossed it is a crunch, reported as shallow. The band is wider than
   * a push-up's: lifting the shoulders 30 degrees is an attempt, not noise.
   */
  partialAngle: 125,
  minVisibility: 0.4,
  minPhaseMs: 150,
  minRepMs: 500,
  /**
   * Torso and legs (hip to ankle) must both be within this many degrees of
   * horizontal at some point in the rest before a rep. At least
   * 180 - upAngleFloor, or a rest the thresholds accept could fail the gate.
   */
  maxLyingTilt: 40,
  /** Frame aspect ratio (width / height) for angle correction. */
  aspect: 1,
};

/** Measure one frame without any state. */
export function measureSitupFrame(pose, options = {}) {
  const opts = { ...SITUP_DEFAULTS, ...options };
  const none = { tracking: false, trunk: null, torsoTilt: null, legTilt: null };
  if (!pose) return none;

  const shoulder = seenMidpoint(pose, 'leftShoulder', 'rightShoulder', opts.minVisibility);
  const hip = seenMidpoint(pose, 'leftHip', 'rightHip', opts.minVisibility);
  const ankle = seenMidpoint(pose, 'leftAnkle', 'rightAnkle', opts.minVisibility);
  if (!shoulder || !hip || !ankle) return none;

  const torsoTilt = tiltFromHorizontal(hip, shoulder, opts.aspect);
  const legTilt = tiltFromHorizontal(hip, ankle, opts.aspect);

  // A point on the floor line, from the hip toward the feet.
  const towardFeet = Math.sign(ankle.x - hip.x);
  const trunk =
    towardFeet === 0 ? null : angleAt(shoulder, hip, { x: hip.x + towardFeet, y: hip.y }, opts.aspect);

  return { tracking: trunk !== null, trunk, torsoTilt, legTilt };
}

/**
 * @param {object} [options]   overrides for SITUP_DEFAULTS
 * @param {string} [exercise]  the id this analyser reports: a crunch is the
 *   same movement cut short, counted here with thresholds that ask for the
 *   shoulders to come off the floor rather than the whole torso.
 */
export function createSitupAnalyzer(options = {}, exercise = 'situp') {
  const opts = { ...SITUP_DEFAULTS, ...options };

  const engine = createRepEngine(opts, [
    {
      // How far from flat the steeper of torso and legs is; the flattest
      // frame of the rest decides, so one bad inference cannot cost a rep.
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
  ]);

  return poseAnalyzer(exercise, engine, (pose) => measureSitupFrame(pose, opts), 'trunk');
}
