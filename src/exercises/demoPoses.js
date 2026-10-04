/**
 * A 3D stick figure doing each exercise, for the "how to" sheet.
 *
 * There are no model files: a figure is a skeleton of fixed bone lengths, and
 * a pose is a handful of angles (forward kinematics). Each exercise is two to
 * five poses and a loop through them; in between, the angles are eased. The
 * renderer (src/components/ExerciseDemo.js) turns the joints into lines for
 * any camera angle, so the figure can be turned with a finger.
 *
 * Pure data and maths, no React Native imports, so the Node suite runs it.
 *
 * Coordinates: metres, y up, the figure faces +z when standing, +x is its
 * left. Angles are degrees.
 *
 * A pose:
 *   rot    [pitch, roll, yaw] of the pelvis. Pitch tips the body forward
 *          (90: lying face down, head towards +z; -90: on the back), roll
 *          tips it onto its right side.
 *   spine  [bend, twist, side] of the chest against the pelvis; bend > 0
 *          curls forward (a crunch), < 0 arches back.
 *   lArm, rArm  [upper flex, upper abd, forearm flex, forearm abd]
 *   lLeg, rLeg  [thigh flex, thigh abd, shin flex, shin abd]
 *          Each bone's direction on its own (not relative to its parent).
 *          Flex 0 points down the body, 90 forward (where the face points),
 *          180 up past the head, < 0 backwards. Abd swings it out to the
 *          figure's side, the same sign for both sides.
 *   world  'arms' | 'legs' | 'all': those bones' flex is against the floor
 *          instead of the body (0 straight down, 90 forward, 180 up), which
 *          is how a push-up is described: arms straight down whatever the
 *          body's tilt. Only the pitch is undone; use it with roll 0.
 *   lift   metres off the floor (a jump)
 */

const BONES = {
  torso: 0.52,
  neck: 0.15,
  head: 0.105,
  shoulder: 0.18,
  hip: 0.1,
  upperArm: 0.29,
  forearm: 0.27,
  thigh: 0.44,
  shin: 0.43,
  foot: 0.13,
};

const DEG = Math.PI / 180;

// --- small vector maths ----------------------------------------------------

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

function rx(v, deg) {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
}
function ry(v, deg) {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}
function rz(v, deg) {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
}

/** A frame is the list of rotations applied, innermost last. */
const turn = (frame, v) => frame.reduceRight((acc, [axis, deg]) => axis(acc, deg), v);

/** A bone's direction in its parent's frame: abduction, then flexion. */
function boneDir(flex, abd, side) {
  return rx(rz([0, -1, 0], abd * side), -flex);
}

// --- poses -----------------------------------------------------------------

const STAND = {
  rot: [0, 0, 0],
  spine: [0, 0, 0],
  lArm: [0, 8, 0, 8],
  rArm: [0, 8, 0, 8],
  lLeg: [0, 4, 0, 4],
  rLeg: [0, 4, 0, 4],
  world: null,
  lift: 0,
};

const pose = (p = {}) => ({ ...STAND, ...p });
const both = (arm) => ({ lArm: arm, rArm: arm });
const legs = (leg) => ({ lLeg: leg, rLeg: leg });

/** The same pose on the other side: left and right swapped, twist and roll reversed. */
function mirror(p) {
  return {
    ...p,
    lArm: p.rArm,
    rArm: p.lArm,
    lLeg: p.rLeg,
    rLeg: p.lLeg,
    rot: [p.rot[0], -p.rot[1], -p.rot[2]],
    spine: [p.spine[0], -p.spine[1], -p.spine[2]],
  };
}

/** Joint positions of one pose, feet (or whatever is lowest) on the floor. */
export function solvePose(p) {
  const [pitch, roll, yaw] = p.rot;
  const [bend, twist, side] = p.spine;
  const world = p.world;
  const pelvisFrame = [[ry, yaw], [rx, pitch], [rz, roll]];
  const chestFrame = [...pelvisFrame, [ry, twist], [rx, bend], [rz, side]];
  const armPitch = world === 'arms' || world === 'all' ? pitch + bend : 0;
  const legPitch = world === 'legs' || world === 'all' ? pitch : 0;

  const pelvis = [0, 0, 0];
  const up = turn(chestFrame, [0, 1, 0]);
  const neck = add(pelvis, scale(up, BONES.torso));
  const head = add(neck, scale(up, BONES.neck));
  const j = { pelvis, neck, head };

  for (const [name, s] of [['L', 1], ['R', -1]]) {
    const arm = p[`${name === 'L' ? 'l' : 'r'}Arm`];
    const leg = p[`${name === 'L' ? 'l' : 'r'}Leg`];
    const shoulder = add(neck, turn(chestFrame, [BONES.shoulder * s, -0.03, 0]));
    const elbow = add(shoulder, scale(turn(chestFrame, boneDir(arm[0] + armPitch, arm[1], s)), BONES.upperArm));
    const hand = add(elbow, scale(turn(chestFrame, boneDir(arm[2] + armPitch, arm[3], s)), BONES.forearm));
    const hip = add(pelvis, turn(pelvisFrame, [BONES.hip * s, 0, 0]));
    const shinLocal = boneDir(leg[2] + legPitch, leg[3], s);
    const knee = add(hip, scale(turn(pelvisFrame, boneDir(leg[0] + legPitch, leg[1], s)), BONES.thigh));
    const ankle = add(knee, scale(turn(pelvisFrame, shinLocal), BONES.shin));
    // The foot sits at a right angle to the shin, in the leg's own plane.
    const footLocal = [shinLocal[0], shinLocal[2], -shinLocal[1]];
    const toe = add(ankle, scale(turn(pelvisFrame, footLocal), BONES.foot));
    Object.assign(j, {
      [`shoulder${name}`]: shoulder,
      [`elbow${name}`]: elbow,
      [`hand${name}`]: hand,
      [`hip${name}`]: hip,
      [`knee${name}`]: knee,
      [`ankle${name}`]: ankle,
      [`toe${name}`]: toe,
    });
  }

  // Rest on the floor: the lowest point (the head counts by its underside).
  let low = j.head[1] - BONES.head;
  for (const [k, v] of Object.entries(j)) if (k !== 'head') low = Math.min(low, v[1]);
  const dy = (p.lift || 0) - low;
  for (const k of Object.keys(j)) j[k] = [j[k][0], j[k][1] + dy, j[k][2]];
  return j;
}

export const HEAD_RADIUS = BONES.head;

/** Bones drawn between joints, with the side they belong to ('C' centre). */
export const SEGMENTS = [
  ['pelvis', 'neck', 'C'],
  ['neck', 'head', 'C'],
  ['hipL', 'hipR', 'C'],
  ['shoulderL', 'shoulderR', 'C'],
  ['shoulderL', 'elbowL', 'L'],
  ['elbowL', 'handL', 'L'],
  ['shoulderR', 'elbowR', 'R'],
  ['elbowR', 'handR', 'R'],
  ['hipL', 'kneeL', 'L'],
  ['kneeL', 'ankleL', 'L'],
  ['ankleL', 'toeL', 'L'],
  ['hipR', 'kneeR', 'R'],
  ['kneeR', 'ankleR', 'R'],
  ['ankleR', 'toeR', 'R'],
];

// --- the exercises ---------------------------------------------------------

const ARMS_DOWN = [0, 12, 0, 12];
const PUSH_TOP = pose({ rot: [72, 0, 0], world: 'arms', ...both(ARMS_DOWN) });
const PUSH_LOW = pose({ rot: [84, 0, 0], world: 'arms', ...both([-80, 40, 0, 10]) });
const ON_BACK_KNEES_UP = { rot: [-90, 0, 0], world: 'legs', ...legs([135, 6, 40, 6]) };
const QUADRUPED = { rot: [78, 0, 0], world: 'all', ...both([0, 8, 0, 8]), ...legs([0, 8, -90, 8]) };
const HANDS_ON_HEAD = [10, 125, 150, -70];
const DUMBBELLS = ['dumbbells'];

/** Every exercise: poses, the loop through them ([pose index, ms]), props, camera. */
const DEMOS = {
  pushup: { poses: [PUSH_TOP, PUSH_LOW], yaw: 70 },
  kneepushup: {
    poses: [
      pose({ rot: [54, 0, 0], world: 'arms', ...both(ARMS_DOWN), ...legs([0, 4, -70, 4]) }),
      pose({ rot: [74, 0, 0], world: 'arms', ...both([-80, 40, 0, 10]), ...legs([0, 4, -70, 4]) }),
    ],
    yaw: 70,
  },
  widepushup: {
    poses: [
      pose({ rot: [72, 0, 0], world: 'arms', ...both([0, 35, 0, 30]) }),
      pose({ rot: [84, 0, 0], world: 'arms', ...both([-55, 65, 0, 28]) }),
    ],
    yaw: 55,
  },
  diamondpushup: {
    poses: [
      pose({ rot: [72, 0, 0], world: 'arms', ...both([0, -14, 0, -14]) }),
      pose({ rot: [84, 0, 0], world: 'arms', ...both([-85, 12, 15, -40]) }),
    ],
    yaw: 55,
  },
  inclinepushup: {
    poses: [
      pose({ rot: [50, 0, 0], world: 'arms', ...both(ARMS_DOWN) }),
      pose({ rot: [62, 0, 0], world: 'arms', ...both([-80, 40, 0, 10]) }),
    ],
    props: [{ kind: 'box', under: 'hand', size: [0.9, 0.4] }],
    yaw: 70,
  },
  declinepushup: {
    poses: [
      pose({ rot: [92, 0, 0], world: 'arms', ...both(ARMS_DOWN) }),
      pose({ rot: [104, 0, 0], world: 'arms', ...both([-80, 40, 0, 10]) }),
    ],
    props: [{ kind: 'box', under: 'toe', size: [0.6, 0.4] }],
    yaw: 70,
  },
  dip: {
    poses: [
      pose({ world: 'all', ...both([-12, 10, -12, 10]), ...legs([75, 8, 0, 8]) }),
      pose({ world: 'all', ...both([-75, 12, 0, 8]), ...legs([115, 8, 0, 8]) }),
    ],
    props: [{ kind: 'box', under: 'hand', size: [0.6, 0.4] }],
    anchor: 'handL',
    yaw: 60,
  },
  pikepushup: {
    poses: [
      pose({ rot: [135, 0, 0], ...both([180, 10, 180, 10]), ...legs([90, 4, 90, 4]) }),
      pose({ rot: [150, 0, 0], world: 'arms', ...both([-50, 35, 5, 10]), ...legs([105, 4, 105, 4]) }),
    ],
    anchor: 'toeL',
    yaw: 80,
  },

  shoulderpress: {
    poses: [pose(both([0, 88, 180, 0])), pose(both([0, 168, 0, 172]))],
    props: DUMBBELLS,
    yaw: 20,
  },
  lateralraise: { poses: [pose(both([0, 10, 0, 10])), pose(both([0, 86, 0, 88]))], props: DUMBBELLS, yaw: 20 },
  frontraise: { poses: [pose(both([0, 6, 0, 6])), pose(both([90, 6, 90, 6]))], props: DUMBBELLS, yaw: 60 },
  bicepcurl: { poses: [pose(both([0, 8, 0, 8])), pose(both([0, 8, 145, 8]))], props: DUMBBELLS, yaw: 50 },
  armcircles: {
    poses: [
      pose(both([12, 86, 12, 86])),
      pose(both([0, 76, 0, 76])),
      pose(both([-12, 86, -12, 86])),
      pose(both([0, 96, 0, 96])),
    ],
    loop: [[1, 220], [2, 220], [3, 220], [0, 220]],
    yaw: 25,
  },

  squat: {
    poses: [
      pose(),
      pose({ rot: [35, 0, 0], world: 'all', ...both([85, 10, 85, 10]), ...legs([85, 12, -25, 10]) }),
    ],
    anchor: 'ankleL',
    yaw: 55,
  },
  sumosquat: {
    poses: [
      pose(legs([0, 22, 0, 22])),
      pose({ rot: [18, 0, 0], world: 'legs', ...both([30, 20, 150, -70]), ...legs([60, 50, -5, 28]) }),
    ],
    anchor: 'ankleL',
    yaw: 20,
  },
  lunge: (() => {
    const left = pose({ world: 'legs', lLeg: [85, 4, 0, 4], rLeg: [-22, 4, -82, 4] });
    return { poses: [pose(), left, mirror(left)], loop: [[1, 800], [0, 700], [2, 800], [0, 700]], yaw: 80 };
  })(),
  sidelunge: (() => {
    const left = pose({ rot: [28, 0, 0], world: 'all', ...both([80, 10, 80, 10]), lLeg: [65, 30, -12, 25], rLeg: [-10, 52, -10, 52] });
    return { poses: [pose(legs([0, 10, 0, 10])), left, mirror(left)], loop: [[1, 800], [0, 700], [2, 800], [0, 700]], yaw: 15 };
  })(),
  splitsquat: {
    poses: [
      pose({ world: 'legs', lLeg: [28, 4, -8, 4], rLeg: [-22, 4, -45, 4] }),
      pose({ world: 'legs', lLeg: [85, 4, 0, 4], rLeg: [-18, 4, -82, 4] }),
    ],
    yaw: 80,
  },
  wallsit: {
    poses: [
      pose({ world: 'legs', ...both([0, 10, 0, 10]), ...legs([90, 8, 0, 8]) }),
      pose({ world: 'legs', spine: [2, 0, 0], ...both([0, 12, 0, 12]), ...legs([90, 8, 0, 8]) }),
    ],
    loop: [[1, 1600], [0, 1600]],
    props: [{ kind: 'wall' }],
    yaw: 60,
  },
  glutebridge: {
    poses: [
      pose({ ...ON_BACK_KNEES_UP, world: 'all', ...both([90, 15, 90, 15]) }),
      pose({ rot: [-125, 0, 0], world: 'all', ...both([90, 15, 90, 15]), ...legs([100, 6, 22, 6]) }),
    ],
    anchor: 'toeL',
    yaw: 75,
  },
  singlelegbridge: {
    poses: [
      pose({ ...ON_BACK_KNEES_UP, world: 'all', ...both([90, 15, 90, 15]), rLeg: [125, 6, 125, 6] }),
      pose({ rot: [-125, 0, 0], world: 'all', ...both([90, 15, 90, 15]), lLeg: [100, 6, 22, 6], rLeg: [93, 6, 93, 6] }),
    ],
    anchor: 'toeL',
    yaw: 75,
  },
  donkeykick: {
    poses: [pose(QUADRUPED), pose({ ...QUADRUPED, rLeg: [-90, 8, 180, 8] })],
    anchor: 'handL',
    yaw: 80,
  },
  firehydrant: {
    poses: [pose(QUADRUPED), pose({ ...QUADRUPED, rLeg: [0, 75, -90, 0] })],
    anchor: 'handL',
    // From behind, where the leg swinging out to the side shows.
    yaw: 160,
  },
  goodmorning: {
    poses: [
      pose(both(HANDS_ON_HEAD)),
      pose({ rot: [78, 0, 0], world: 'legs', ...both(HANDS_ON_HEAD), ...legs([12, 6, -8, 6]) }),
    ],
    anchor: 'ankleL',
    yaw: 80,
  },

  situp: {
    poses: [
      pose({ ...ON_BACK_KNEES_UP, ...both([0, 14, 0, 14]) }),
      pose({ ...ON_BACK_KNEES_UP, spine: [80, 0, 0], ...both([80, 10, 80, 10]) }),
    ],
    anchor: 'toeL',
    yaw: 75,
  },
  crunch: {
    poses: [
      pose({ ...ON_BACK_KNEES_UP, ...both([25, 12, 25, 12]) }),
      pose({ ...ON_BACK_KNEES_UP, spine: [32, 0, 0], ...both([30, 12, 30, 12]) }),
    ],
    anchor: 'toeL',
    yaw: 75,
  },
  legraise: {
    poses: [
      pose({ rot: [-90, 0, 0], ...both([0, 15, 0, 15]), ...legs([8, 4, 8, 4]) }),
      pose({ rot: [-90, 0, 0], ...both([0, 15, 0, 15]), ...legs([88, 4, 88, 4]) }),
    ],
    anchor: 'head',
    yaw: 80,
  },
  bicyclecrunch: (() => {
    const left = pose({
      rot: [-90, 0, 0],
      spine: [32, 32, 0],
      // Fingertips at the temples, elbows wide.
      ...both([150, 75, 215, -20]),
      lLeg: [100, 4, 10, 4],
      rLeg: [32, 4, 32, 4],
    });
    return { poses: [left, mirror(left)], loop: [[1, 450], [0, 450]], yaw: 60 };
  })(),
  mountainclimber: (() => {
    const left = pose({ ...PUSH_TOP, lLeg: [115, 4, 12, 4] });
    return { poses: [PUSH_TOP, left, mirror(left)], loop: [[1, 300], [2, 300]], anchor: 'handL', yaw: 75 };
  })(),
  russiantwist: (() => {
    const left = pose({
      rot: [-45, 0, 0],
      spine: [0, 40, 0],
      world: 'legs',
      ...both([55, 10, 95, -55]),
      ...legs([130, 6, 75, 6]),
    });
    return { poses: [left, mirror(left)], loop: [[1, 600], [0, 600]], yaw: 30 };
  })(),
  plank: {
    poses: [
      pose({ rot: [82, 0, 0], world: 'arms', ...both([0, 10, 90, 0]) }),
      pose({ rot: [82, 0, 0], spine: [-2, 0, 0], world: 'arms', ...both([0, 10, 90, 0]) }),
    ],
    loop: [[1, 1600], [0, 1600]],
    yaw: 70,
  },
  sideplank: {
    poses: [
      pose({ rot: [0, 72, 0], lArm: [0, 108, 0, 108], rArm: [0, 72, 90, 0], ...legs([0, 2, 0, 2]) }),
      pose({ rot: [0, 74, 0], lArm: [0, 106, 0, 106], rArm: [0, 74, 90, 0], ...legs([0, 2, 0, 2]) }),
    ],
    loop: [[1, 1600], [0, 1600]],
    yaw: 5,
  },
  hollowhold: {
    poses: [
      pose({ rot: [-90, 0, 0], spine: [25, 0, 0], ...both([170, 12, 170, 12]), ...legs([25, 3, 25, 3]) }),
      pose({ rot: [-90, 0, 0], spine: [27, 0, 0], ...both([168, 12, 168, 12]), ...legs([27, 3, 27, 3]) }),
    ],
    loop: [[1, 1600], [0, 1600]],
    yaw: 75,
  },
  superman: {
    poses: [
      pose({ rot: [90, 0, 0], ...both([180, 14, 180, 14]), ...legs([0, 5, 0, 5]) }),
      pose({ rot: [90, 0, 0], spine: [-18, 0, 0], ...both([198, 14, 198, 14]), ...legs([-16, 5, -16, 5]) }),
    ],
    loop: [[1, 900], [1, 1200], [0, 900]],
    yaw: 75,
  },

  jumpingjack: {
    poses: [pose(), pose({ ...both([0, 165, 0, 172]), ...legs([0, 20, 0, 20]), lift: 0.04 })],
    loop: [[1, 380], [0, 380]],
    yaw: 15,
  },
  highknees: (() => {
    const left = pose({ lLeg: [92, 4, 0, 4], lArm: [-30, 8, 40, 8], rArm: [40, 8, 100, 8], lift: 0.03 });
    return { poses: [left, mirror(left)], loop: [[1, 280], [0, 280]], yaw: 45 };
  })(),
  buttkicks: (() => {
    const left = pose({ world: 'legs', lLeg: [-8, 4, -165, 4], lArm: [-25, 8, 45, 8], rArm: [35, 8, 95, 8], lift: 0.03 });
    return { poses: [left, mirror(left)], loop: [[1, 280], [0, 280]], yaw: 75 };
  })(),
  burpee: {
    poses: [
      pose(),
      pose({ rot: [62, 0, 0], world: 'all', ...both([0, 14, 0, 14]), ...legs([125, 10, -20, 10]) }),
      PUSH_TOP,
      pose({ ...both([0, 170, 0, 172]), lift: 0.18 }),
    ],
    loop: [[1, 450], [2, 400], [1, 400], [0, 300], [3, 300], [0, 300]],
    yaw: 70,
  },
};

const DEFAULT_LOOP = [[1, 900], [0, 900]];

/** The demo for an exercise: its poses solved once, ready to interpolate. */
export function getDemo(exerciseId) {
  const demo = DEMOS[exerciseId] || DEMOS.pushup;
  const loop = demo.loop || DEFAULT_LOOP;
  return {
    poses: demo.poses,
    loop,
    period: loop.reduce((sum, [, ms]) => sum + ms, 0),
    anchor: demo.anchor || null,
    props: demo.props || [],
    yaw: demo.yaw ?? 45,
  };
}

export const DEMO_IDS = Object.keys(DEMOS);

const lerp = (a, b, t) => a + (b - a) * t;
const lerpList = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

function blend(a, b, t) {
  // A world-mode pose and a body-mode one cannot be eased angle by angle, so
  // ease the joints instead (only the burpee and a few others mix them).
  return {
    rot: lerpList(a.rot, b.rot, t),
    spine: lerpList(a.spine, b.spine, t),
    lArm: lerpList(a.lArm, b.lArm, t),
    rArm: lerpList(a.rArm, b.rArm, t),
    lLeg: lerpList(a.lLeg, b.lLeg, t),
    rLeg: lerpList(a.rLeg, b.rLeg, t),
    world: a.world,
    lift: lerp(a.lift || 0, b.lift || 0, t),
  };
}

function blendJoints(a, b, t) {
  const out = {};
  for (const k of Object.keys(a)) out[k] = lerpList(a[k], b[k], t);
  return out;
}

/**
 * The figure's joints `ms` into the loop. The anchor joint (a planted foot or
 * hand) keeps the place it has in the first pose, so the body moves around it
 * as a real one would rather than sliding along the floor.
 */
export function framesAt(demo, ms) {
  const t = ((ms % demo.period) + demo.period) % demo.period;
  let from = demo.loop[demo.loop.length - 1][0];
  let elapsed = 0;
  let joints = null;
  for (const [to, dur] of demo.loop) {
    if (t < elapsed + dur) {
      const k = ease((t - elapsed) / dur);
      const a = demo.poses[from];
      const b = demo.poses[to];
      joints = a.world === b.world ? solvePose(blend(a, b, k)) : blendJoints(solvePose(a), solvePose(b), k);
      break;
    }
    elapsed += dur;
    from = to;
  }
  return place(demo, joints);
}

/** Shift joints so the anchor sits where it does in the first pose. */
function place(demo, joints) {
  const first = anchorOrigin(demo);
  const at = demo.anchor ? joints[demo.anchor] : joints.pelvis;
  const dx = first[0] - at[0];
  const dz = first[2] - at[2];
  const out = {};
  for (const [k, v] of Object.entries(joints)) out[k] = [v[0] + dx, v[1], v[2] + dz];
  return out;
}

const origins = new WeakMap();
function anchorOrigin(demo) {
  if (!origins.has(demo)) {
    // solvePose puts the pelvis over the origin; the anchor stays where that leaves it.
    const j = solvePose(demo.poses[0]);
    origins.set(demo, demo.anchor ? j[demo.anchor] : j.pelvis);
  }
  return origins.get(demo);
}

/**
 * Where to centre the camera and how big the scene is: the box around a few
 * samples of the loop, so turning the figure never pushes it out of frame.
 */
export function sceneBounds(demo, samples = 24) {
  let maxY = 0;
  let cx = 0;
  let cz = 0;
  const pts = [];
  for (let i = 0; i < samples; i++) {
    const j = framesAt(demo, (demo.period * i) / samples);
    for (const v of Object.values(j)) {
      pts.push(v);
      maxY = Math.max(maxY, v[1]);
    }
  }
  for (const v of pts) {
    cx += v[0];
    cz += v[2];
  }
  cx /= pts.length;
  cz /= pts.length;
  let radius = 0;
  for (const v of pts) radius = Math.max(radius, Math.hypot(v[0] - cx, v[2] - cz));
  return { center: [cx, cz], radius: radius + HEAD_RADIUS, height: maxY + HEAD_RADIUS };
}

/**
 * The props in the first pose's place: a box under the hands or feet, or a
 * wall behind the back. Each is a box: centre x/z, floor-to-top y, half sizes.
 */
export function propBoxes(demo) {
  const j = framesAt(demo, 0);
  const boxes = [];
  for (const prop of demo.props) {
    if (prop === 'dumbbells') continue;
    if (prop.kind === 'box') {
      const a = j[`${prop.under}L`];
      const b = j[`${prop.under}R`];
      const top = Math.max(0.05, Math.min(a[1], b[1]));
      boxes.push({ x: (a[0] + b[0]) / 2, z: (a[2] + b[2]) / 2, w: prop.size[0] / 2, d: prop.size[1] / 2, h: top });
    } else if (prop.kind === 'wall') {
      // Flat against the back: behind the pelvis, along the figure's width.
      boxes.push({ x: j.pelvis[0], z: j.pelvis[2] - 0.1, w: 0.7, d: 0.03, h: 1.6 });
    }
  }
  return boxes;
}

export const hasDumbbells = (demo) => demo.props.includes('dumbbells');
