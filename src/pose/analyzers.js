import { DEFAULTS, createPushupAnalyzer } from './pushupAnalyzer';
import { SQUAT_DEFAULTS, createSquatAnalyzer } from './squatAnalyzer';
import { SITUP_DEFAULTS, createSitupAnalyzer } from './situpAnalyzer';
import { JUMPING_JACK_DEFAULTS, createJumpingJackAnalyzer } from './jumpingJackAnalyzer';
import {
  CURL_DEFAULTS,
  DIP_DEFAULTS,
  PIKE_DEFAULTS,
  PRESS_DEFAULTS,
  RAISE_DEFAULTS,
  createCurlAnalyzer,
  createDipAnalyzer,
  createPikePushupAnalyzer,
  createPressAnalyzer,
  createRaiseAnalyzer,
} from './upperBodyAnalyzers';
import {
  BRIDGE_DEFAULTS,
  GOOD_MORNING_DEFAULTS,
  THIGH_LIFT_DEFAULTS,
  createBridgeAnalyzer,
  createGoodMorningAnalyzer,
  createThighLiftAnalyzer,
} from './lowerBodyAnalyzers';
import {
  BURPEE_DEFAULTS,
  CRUNCH_DEFAULTS,
  LEG_RAISE_DEFAULTS,
  SCISSOR_DEFAULTS,
  TWIST_DEFAULTS,
  createBurpeeAnalyzer,
  createLegRaiseAnalyzer,
  createScissorAnalyzer,
  createTwistAnalyzer,
} from './coreAnalyzers';
import {
  ARCH_DEFAULTS,
  ARM_CIRCLE_DEFAULTS,
  PLANK_DEFAULTS,
  SIDE_PLANK_DEFAULTS,
  SUPERMAN_DEFAULTS,
  WALL_SIT_DEFAULTS,
  createArchAnalyzer,
  createArmCircleAnalyzer,
  createPlankAnalyzer,
  createWallSitAnalyzer,
} from './holdAnalyzers';
import { ISSUES } from './repEngine';
import { createVisibilityGate } from './visibility';

/**
 * One way in to every pose analyser: pick by exercise id.
 *
 * The ids are the ones in src/exercises/exercises.js. This file does not import
 * that table: the generated pose page inlines everything under src/pose/ and
 * nothing else, and needs only the ids. scripts/verify-pose.mjs checks the two
 * lists agree.
 *
 * Every analyser has the same contract — `reps` and `phase` getters, `reset()`,
 * `push(pose, timestamp)` returning { reps, phase, repCompleted, partialRep,
 * issues, tracking, thresholds, signal, ...its own readings } — so the stages
 * and the page never branch on the exercise to count it. A hold (plank, wall
 * sit...) reports seconds held as its reps; see ./holdAnalyzers.
 *
 * Several exercises share an analyser under their own id: the push-up
 * variants bend the elbows as a push-up does, the squat family lowers the hips
 * as a squat does, and so on. Each entry below is [defaults, factory]; the
 * defaults are the analyser's merged options, for the page's debug HUD.
 */

/** Issue ids every analyser reports in (see ./repEngine for what each means). */
export { ISSUES };

const variant = (base, overrides) => ({ ...base, ...overrides });

const POSE_TABLE = {
  // --- the original four
  pushup: [DEFAULTS, (o) => createPushupAnalyzer(o)],
  squat: [SQUAT_DEFAULTS, (o) => createSquatAnalyzer(o)],
  situp: [SITUP_DEFAULTS, (o) => createSitupAnalyzer(o)],
  jumpingjack: [JUMPING_JACK_DEFAULTS, (o) => createJumpingJackAnalyzer(o)],

  // --- chest and triceps: the push-up's elbow, under each variant's own id.
  // An incline push-up (hands on a chair) sits further from horizontal.
  kneepushup: [DEFAULTS, (o) => createPushupAnalyzer(o, 'kneepushup')],
  widepushup: [DEFAULTS, (o) => createPushupAnalyzer(o, 'widepushup')],
  diamondpushup: [DEFAULTS, (o) => createPushupAnalyzer(o, 'diamondpushup')],
  inclinepushup: [
    variant(DEFAULTS, { maxTorsoTilt: 65 }),
    (o) => createPushupAnalyzer({ maxTorsoTilt: 65, ...o }, 'inclinepushup'),
  ],
  declinepushup: [DEFAULTS, (o) => createPushupAnalyzer(o, 'declinepushup')],
  dip: [DIP_DEFAULTS, (o) => createDipAnalyzer(o)],

  // --- shoulders and arms
  pikepushup: [PIKE_DEFAULTS, (o) => createPikePushupAnalyzer(o)],
  shoulderpress: [PRESS_DEFAULTS, (o) => createPressAnalyzer(o)],
  lateralraise: [RAISE_DEFAULTS, (o) => createRaiseAnalyzer(o, 'lateralraise')],
  frontraise: [
    variant(RAISE_DEFAULTS, { bothArms: false }),
    (o) => createRaiseAnalyzer({ bothArms: false, ...o }, 'frontraise'),
  ],
  bicepcurl: [CURL_DEFAULTS, (o) => createCurlAnalyzer(o)],
  armcircles: [ARM_CIRCLE_DEFAULTS, (o) => createArmCircleAnalyzer(o)],

  // --- legs and glutes: the squat's hip height, under each variant's own id
  sumosquat: [SQUAT_DEFAULTS, (o) => createSquatAnalyzer(o, 'sumosquat')],
  lunge: [SQUAT_DEFAULTS, (o) => createSquatAnalyzer(o, 'lunge')],
  sidelunge: [SQUAT_DEFAULTS, (o) => createSquatAnalyzer(o, 'sidelunge')],
  splitsquat: [SQUAT_DEFAULTS, (o) => createSquatAnalyzer(o, 'splitsquat')],
  wallsit: [WALL_SIT_DEFAULTS, (o) => createWallSitAnalyzer(o)],
  glutebridge: [BRIDGE_DEFAULTS, (o) => createBridgeAnalyzer(o, 'glutebridge')],
  singlelegbridge: [BRIDGE_DEFAULTS, (o) => createBridgeAnalyzer(o, 'singlelegbridge')],
  donkeykick: [THIGH_LIFT_DEFAULTS, (o) => createThighLiftAnalyzer(o, 'donkeykick')],
  firehydrant: [THIGH_LIFT_DEFAULTS, (o) => createThighLiftAnalyzer(o, 'firehydrant')],
  goodmorning: [GOOD_MORNING_DEFAULTS, (o) => createGoodMorningAnalyzer(o)],

  // --- core
  crunch: [CRUNCH_DEFAULTS, (o) => createSitupAnalyzer({ ...CRUNCH_DEFAULTS, ...o }, 'crunch')],
  legraise: [LEG_RAISE_DEFAULTS, (o) => createLegRaiseAnalyzer(o)],
  bicyclecrunch: [
    variant(SCISSOR_DEFAULTS, { legs: 'hip', posture: 'lying' }),
    (o) => createScissorAnalyzer({ legs: 'hip', posture: 'lying', ...o }, 'bicyclecrunch'),
  ],
  mountainclimber: [
    variant(SCISSOR_DEFAULTS, { legs: 'hip', posture: 'plank' }),
    (o) => createScissorAnalyzer({ legs: 'hip', posture: 'plank', ...o }, 'mountainclimber'),
  ],
  russiantwist: [TWIST_DEFAULTS, (o) => createTwistAnalyzer(o)],
  plank: [PLANK_DEFAULTS, (o) => createPlankAnalyzer(o, 'plank')],
  sideplank: [SIDE_PLANK_DEFAULTS, (o) => createPlankAnalyzer(o, 'sideplank')],
  hollowhold: [ARCH_DEFAULTS, (o) => createArchAnalyzer(o, 'hollowhold')],
  superman: [SUPERMAN_DEFAULTS, (o) => createArchAnalyzer(o, 'superman')],

  // --- cardio
  highknees: [SCISSOR_DEFAULTS, (o) => createScissorAnalyzer(o, 'highknees')],
  buttkicks: [
    variant(SCISSOR_DEFAULTS, { legs: 'shin' }),
    (o) => createScissorAnalyzer({ legs: 'shin', ...o }, 'buttkicks'),
  ],
  burpee: [BURPEE_DEFAULTS, (o) => createBurpeeAnalyzer(o)],
};

export const POSE_EXERCISE_IDS = Object.keys(POSE_TABLE);

/** Each analyser's default options, for showing its thresholds (the page's debug HUD). */
export const POSE_DEFAULTS = Object.fromEntries(POSE_EXERCISE_IDS.map((id) => [id, POSE_TABLE[id][0]]));

/** The exercises counted as time held rather than reps. */
export const POSE_HOLD_IDS = ['armcircles', 'wallsit', 'plank', 'sideplank', 'hollowhold', 'superman'];

/** The exercise an analyser will actually count for this id: unknown or missing is a push-up. */
export function poseExerciseId(exerciseId) {
  return POSE_EXERCISE_IDS.includes(exerciseId) ? exerciseId : 'pushup';
}

// --- what each exercise needs the camera to see --------------------------------
// The joints each analyser reads, as groups for the visibility gate
// (./visibility). Counting waits until all of them have been in view for a
// second, and until then the user is told which body part is missing.
const need = (joints, sides) => ({ joints, sides });
const ARM_SIDE = need(['Shoulder', 'Elbow', 'Wrist'], 'either');
const ARMS_BOTH = need(['Shoulder', 'Elbow', 'Wrist'], 'both');
const HIPS = need(['Hip'], 'any');
const TORSO = need(['Shoulder', 'Hip'], 'any');
const LEG_SIDE = need(['Hip', 'Knee', 'Ankle'], 'either');
const LEGS_BOTH = need(['Hip', 'Knee', 'Ankle'], 'both');
const BODY_LINE = need(['Shoulder', 'Hip', 'Knee', 'Ankle'], 'any');

const PUSHUP_NEEDS = [ARM_SIDE, need(['Hip', 'Knee'], 'any')];
const SQUAT_NEEDS = [LEG_SIDE, need(['Shoulder'], 'any')];
const LYING_NEEDS = [need(['Shoulder', 'Hip', 'Ankle'], 'any')];

export const POSE_NEEDS = {
  pushup: PUSHUP_NEEDS,
  squat: SQUAT_NEEDS,
  situp: LYING_NEEDS,
  jumpingjack: [need(['Shoulder', 'Elbow', 'Hip'], 'both')],

  kneepushup: PUSHUP_NEEDS,
  widepushup: PUSHUP_NEEDS,
  diamondpushup: PUSHUP_NEEDS,
  inclinepushup: PUSHUP_NEEDS,
  declinepushup: PUSHUP_NEEDS,
  dip: [ARM_SIDE, HIPS],

  pikepushup: [ARM_SIDE, need(['Hip', 'Knee'], 'any')],
  shoulderpress: [ARMS_BOTH, HIPS],
  lateralraise: [ARMS_BOTH, HIPS],
  frontraise: [ARM_SIDE, HIPS],
  bicepcurl: [ARM_SIDE, HIPS],
  armcircles: [need(['Shoulder', 'Elbow'], 'both'), HIPS],

  sumosquat: SQUAT_NEEDS,
  lunge: SQUAT_NEEDS,
  sidelunge: SQUAT_NEEDS,
  splitsquat: SQUAT_NEEDS,
  wallsit: [need(['Shoulder', 'Hip', 'Knee', 'Ankle'], 'either')],
  glutebridge: [need(['Shoulder', 'Hip', 'Knee', 'Ankle'], 'either')],
  singlelegbridge: [need(['Shoulder', 'Hip', 'Knee', 'Ankle'], 'either')],
  donkeykick: [need(['Shoulder', 'Hip', 'Knee'], 'either')],
  firehydrant: [need(['Shoulder', 'Hip', 'Knee'], 'either')],
  goodmorning: [need(['Shoulder', 'Hip', 'Knee', 'Ankle'], 'either')],

  crunch: LYING_NEEDS,
  legraise: LYING_NEEDS,
  bicyclecrunch: [TORSO, need(['Hip', 'Knee'], 'both')],
  mountainclimber: [TORSO, need(['Hip', 'Knee'], 'both')],
  russiantwist: [TORSO, need(['Wrist'], 'any')],
  plank: [BODY_LINE],
  sideplank: [BODY_LINE],
  hollowhold: [need(['Shoulder', 'Elbow', 'Hip', 'Knee'], 'any')],
  superman: [need(['Shoulder', 'Elbow', 'Hip', 'Knee'], 'any')],

  highknees: [TORSO, LEGS_BOTH],
  buttkicks: [TORSO, LEGS_BOTH],
  burpee: [BODY_LINE],
};

/**
 * A fresh visibility gate for this exercise (unknown or missing: a push-up).
 * @param {string} exerciseId
 * @param {object} [options]  overrides for the gate's defaults
 */
export function createExerciseGate(exerciseId, options) {
  return createVisibilityGate(POSE_NEEDS[poseExerciseId(exerciseId)], options);
}

/**
 * A fresh analyser for this exercise; unknown or missing ids get the push-up
 * one, as everywhere else in the app.
 * @param {string} exerciseId
 * @param {object} [options]  overrides for that analyser's defaults (aspect, ...)
 */
export function createAnalyzer(exerciseId, options) {
  return POSE_TABLE[poseExerciseId(exerciseId)][1](options);
}
