import { getExercise } from './exercises';

/**
 * Where the phone goes for the camera to count an exercise: which way it
 * looks at the body (the exercise's `view`), how the body is placed, how far
 * away and how high. The setup card (src/components/CameraSetupGuide.js)
 * draws this; the words come from `setup.*` strings and the exercise's own
 * `exercise.<id>.hint.ai`.
 *
 *   posture   'floor' lying or on all fours, 'stand' upright, 'seat' sitting
 *   height    'floor' propped on the floor, 'knee' or 'waist' high
 *   distance  metres, roughly: the whole movement has to stay in frame
 */

const FLOOR = new Set([
  'pushup', 'kneepushup', 'widepushup', 'diamondpushup', 'declinepushup', 'pikepushup',
  'situp', 'crunch', 'legraise', 'bicyclecrunch', 'mountainclimber',
  'plank', 'sideplank', 'hollowhold', 'superman',
  'glutebridge', 'singlelegbridge', 'donkeykick', 'firehydrant',
]);
const SEATED = new Set(['russiantwist', 'dip']);
/** Movements that travel or jump: the frame needs room around them. */
const WIDE = new Set(['jumpingjack', 'burpee', 'highknees', 'buttkicks', 'lunge', 'sidelunge']);
const KNEE_HIGH = new Set(['squat', 'sumosquat', 'splitsquat', 'wallsit', 'lunge', 'sidelunge']);

export function cameraSetupFor(exerciseId) {
  const exercise = getExercise(exerciseId);
  const id = exercise.id;
  const posture = FLOOR.has(id) ? 'floor' : SEATED.has(id) ? 'seat' : 'stand';
  return {
    exerciseId: id,
    view: exercise.view,
    posture,
    height: posture === 'floor' ? 'floor' : KNEE_HIGH.has(id) || posture === 'seat' ? 'knee' : 'waist',
    distance: WIDE.has(id) ? 3 : posture === 'floor' ? 2 : 2.5,
  };
}
