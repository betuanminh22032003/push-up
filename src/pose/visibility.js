/**
 * The visibility gate: counting starts only once the camera has seen every
 * joint an exercise needs, confidently, for about a second.
 *
 * Before it, an analyser fed half a body learns its range from noise, and
 * the user sees a counter stuck at zero with no idea why. The gate instead
 * says which body part is out of frame ("legs"), and opens once the whole
 * set-up is right. It latches: once open it stays open for the set, and the
 * analysers' own lost-tracking handling takes over from there.
 *
 * Each exercise declares what it needs in ./analyzers.js (POSE_NEEDS), as a
 * list of groups:
 *   { joints: ['Shoulder', 'Elbow', 'Wrist'], sides: 'either' }
 *     'either'  all of them on one side (side-on, the far arm is hidden)
 *     'both'    all of them on both sides (front-on, e.g. both arms)
 *     'any'     each of them on at least one side
 * Joint names are JOINTS from ./landmarks without the side ('nose' has none).
 *
 * Pure and dependency-free: inlined into the pose page with the analysers.
 */

/** Which body part a joint belongs to, for telling the user what is missing. */
export const PART_OF_JOINT = {
  nose: 'head',
  Shoulder: 'shoulders',
  Elbow: 'arms',
  Wrist: 'arms',
  Hip: 'hips',
  Knee: 'legs',
  Ankle: 'legs',
};

/** The order parts are named in, head to toe; 'body' means no one at all. */
export const BODY_PARTS_ORDER = ['body', 'head', 'shoulders', 'arms', 'hips', 'legs'];

export const GATE_DEFAULTS = {
  // Higher than the analysers' 0.4: a joint the model is unsure of at the
  // start is the one that flickers in and out mid-set.
  minScore: 0.6,
  holdMs: 1000,
  // One dropped frame does not restart the second.
  graceMs: 250,
};

const GATE_SIDES = ['left', 'right'];

function gateJointName(side, joint) {
  return joint === 'nose' ? 'nose' : side + joint;
}

/**
 * The body parts `needs` cannot see in this frame, head to toe; [] when
 * everything is in view, ['body'] when there is no pose at all.
 */
export function missingParts(pose, needs, minScore = GATE_DEFAULTS.minScore) {
  if (!pose) return ['body'];
  const seen = (name) => {
    const p = pose[name];
    return !!p && Number.isFinite(p.score) && p.score >= minScore && Number.isFinite(p.x) && Number.isFinite(p.y);
  };
  const missingJoints = new Set();
  for (const group of needs) {
    const unseenOn = (side) => group.joints.filter((j) => !seen(gateJointName(side, j)));
    if (group.sides === 'both') {
      for (const side of GATE_SIDES) for (const j of unseenOn(side)) missingJoints.add(j);
    } else if (group.sides === 'any') {
      for (const j of group.joints) {
        if (!GATE_SIDES.some((side) => seen(gateJointName(side, j)))) missingJoints.add(j);
      }
    } else {
      // 'either': the better side; what it lacks is what to bring into view.
      const left = unseenOn('left');
      const right = unseenOn('right');
      for (const j of right.length < left.length ? right : left) missingJoints.add(j);
    }
  }
  const parts = new Set([...missingJoints].map((j) => PART_OF_JOINT[j] || 'body'));
  return BODY_PARTS_ORDER.filter((part) => parts.has(part));
}

/**
 * @param {Array} needs     the exercise's groups (see above)
 * @param {object} options  overrides for GATE_DEFAULTS
 * @returns {{ push(pose, now): {ready, visible, missing, progress}, reset(), ready: boolean }}
 */
export function createVisibilityGate(needs, options = {}) {
  const opts = { ...GATE_DEFAULTS, ...options };
  let since = null;
  let lostAt = null;
  let ready = false;

  return {
    get ready() {
      return ready;
    },
    reset() {
      since = null;
      lostAt = null;
      ready = false;
    },
    push(pose, now) {
      const missing = missingParts(pose, needs, opts.minScore);
      const visible = missing.length === 0;
      if (ready) return { ready, visible, missing, progress: 1 };

      if (visible) {
        if (since === null) since = now;
        lostAt = null;
      } else if (since !== null) {
        if (lostAt === null) lostAt = now;
        if (now - lostAt > opts.graceMs) since = null;
      }
      const progress = since === null ? 0 : Math.min(1, (now - since) / opts.holdMs);
      if (visible && progress >= 1) ready = true;
      return { ready, visible, missing, progress };
    },
  };
}
