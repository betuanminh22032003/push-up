import { DEFAULTS, createPushupAnalyzer } from './pushupAnalyzer';
import { SQUAT_DEFAULTS, createSquatAnalyzer } from './squatAnalyzer';
import { SITUP_DEFAULTS, createSitupAnalyzer } from './situpAnalyzer';
import { JUMPING_JACK_DEFAULTS, createJumpingJackAnalyzer } from './jumpingJackAnalyzer';
import { ISSUES } from './repEngine';

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
 * and the page never branch on the exercise to count it.
 */

/** Issue ids every analyser reports in (see ./repEngine for what each means). */
export { ISSUES };

export const POSE_EXERCISE_IDS = ['pushup', 'squat', 'situp', 'jumpingjack'];

const POSE_FACTORIES = {
  pushup: createPushupAnalyzer,
  squat: createSquatAnalyzer,
  situp: createSitupAnalyzer,
  jumpingjack: createJumpingJackAnalyzer,
};

/** Each analyser's default options, for showing its thresholds (the page's debug HUD). */
export const POSE_DEFAULTS = {
  pushup: DEFAULTS,
  squat: SQUAT_DEFAULTS,
  situp: SITUP_DEFAULTS,
  jumpingjack: JUMPING_JACK_DEFAULTS,
};

/** The exercise an analyser will actually count for this id: unknown or missing is a push-up. */
export function poseExerciseId(exerciseId) {
  return POSE_EXERCISE_IDS.includes(exerciseId) ? exerciseId : 'pushup';
}

/**
 * A fresh analyser for this exercise; unknown or missing ids get the push-up
 * one, as everywhere else in the app.
 * @param {string} exerciseId
 * @param {object} [options]  overrides for that analyser's defaults (aspect, ...)
 */
export function createAnalyzer(exerciseId, options) {
  return POSE_FACTORIES[poseExerciseId(exerciseId)](options);
}
