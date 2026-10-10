/**
 * The exercises the app can count.
 *
 * One table drives everything that differs between them: which detection
 * sources make sense, how much fun time a rep earns, the fastest believable
 * cadence, and what the motion source watches for. Screens, stats and the
 * pose page read from here, so adding an exercise starts in this file.
 *
 * Every exercise here has a camera analyser (src/pose/analyzers.js, same ids
 * in the same order): it can be counted from the pose model's landmarks alone.
 *
 * Pure data and helpers, no React Native imports, so the Node suite and the
 * generated pose page can load it as is.
 *
 *   id            stable key, persisted on sessions and in settings
 *   icon          emoji shown next to the name
 *   kind          'reps', or 'hold' for isometric holds counted in seconds
 *                 (a plank's "reps" are the seconds held with good form)
 *   parts         body parts it trains, from BODY_PARTS, main one first
 *   view          where the camera goes: 'side' or 'front' of the body
 *   sources       detection sources that work for it, best first
 *                 (ids from src/sensors/sources.js)
 *   creditWeight  fun time a rep (for a hold, a second) earns, relative to a
 *                 push-up. A jumping jack is far less work than a push-up, and
 *                 the blocker would be trivial to cheat if it paid the same.
 *   minRepMs      fastest believable gap between two reps
 *   motion        motion-source rule: the phone's tilt away from where it was
 *                 when the set started. `nearDeg` or more is the bottom of a
 *                 rep, `farDeg` or less is back at the start; between the two
 *                 the state holds (hysteresis).
 *
 * Translation keys (src/i18n/strings.js) follow the id:
 *   exercise.<id>               name, e.g. "Squats"
 *   exercise.<id>.noun          lower-case plural for sentences, e.g. "squats"
 *   exercise.<id>.cue           one line of form cues
 *   exercise.<id>.hint.<source> how to set up the phone for that source
 *   coach.<id>.<issue>          the exercise's own wording of a coaching issue
 */

export const DEFAULT_EXERCISE_ID = 'pushup';

/** Body-part tags, in the order the picker shows its filter chips. */
export const BODY_PARTS = ['chest', 'shoulders', 'arms', 'back', 'core', 'legs', 'glutes', 'cardio'];

const REPS = 'reps';
const HOLD = 'hold';

/** A rep exercise counted by the camera, with tapping the screen as the fallback. */
const camera = (id, icon, parts, view, creditWeight, extra = {}) => ({
  id,
  icon,
  kind: REPS,
  parts,
  view,
  sources: ['ai', 'tap'],
  creditWeight,
  minRepMs: 500,
  motion: null,
  ...extra,
});

/** A hold: the camera times it; without one, a plain stopwatch does. */
const hold = (id, icon, parts, view, creditWeight) => ({
  id,
  icon,
  kind: HOLD,
  parts,
  view,
  sources: ['ai', 'timer'],
  creditWeight,
  minRepMs: 1000,
  motion: null,
});

/** Push-up variants the earpiece light sensor can count as well, phone under the chest. */
const UNDER_CHEST = { sources: ['ai', 'light', 'tap'] };

/** Alternating legs: two or three a second, each side its own rep. */
const BRISK = { minRepMs: 250 };

export const EXERCISES = [
  // --- the original four, first so their order (and the default) never moves
  {
    id: 'pushup',
    icon: '💪',
    kind: REPS,
    parts: ['chest', 'arms', 'shoulders'],
    view: 'side',
    sources: ['ai', 'light', 'tap'],
    creditWeight: 1,
    minRepMs: 500,
    motion: null,
  },
  {
    id: 'squat',
    icon: '🦵',
    kind: REPS,
    parts: ['legs', 'glutes'],
    view: 'front',
    sources: ['ai', 'motion', 'tap'],
    creditWeight: 0.5,
    minRepMs: 500,
    // Phone in a front trouser pocket: the thigh goes from upright to roughly
    // level, about 80 degrees for a parallel squat, 50 for a half squat.
    motion: { nearDeg: 45, farDeg: 20 },
  },
  {
    id: 'situp',
    icon: '🧘',
    kind: REPS,
    parts: ['core'],
    view: 'side',
    sources: ['ai', 'motion', 'tap'],
    creditWeight: 0.5,
    minRepMs: 500,
    // Phone held flat against the chest: the torso rises 60-80 degrees from
    // the floor on a full sit-up.
    motion: { nearDeg: 45, farDeg: 20 },
  },
  {
    id: 'jumpingjack',
    icon: '🤸',
    kind: REPS,
    parts: ['cardio', 'shoulders', 'legs'],
    view: 'front',
    sources: ['ai', 'motion', 'tap'],
    creditWeight: 0.25,
    // A brisk jumping jack takes about 0.6 s; the push-up floor of 500 ms
    // would drop real reps.
    minRepMs: 350,
    // Phone held in one hand: the arm swings from the hip to overhead, so the
    // phone turns through 150 degrees or more.
    motion: { nearDeg: 100, farDeg: 50 },
  },

  // --- chest and triceps
  camera('kneepushup', '🙇', ['chest', 'arms'], 'side', 0.5, UNDER_CHEST),
  camera('widepushup', '🫸', ['chest', 'shoulders'], 'side', 1, UNDER_CHEST),
  camera('diamondpushup', '💎', ['arms', 'chest'], 'side', 1, UNDER_CHEST),
  camera('inclinepushup', '📐', ['chest', 'arms'], 'side', 0.6),
  camera('declinepushup', '⛰️', ['chest', 'shoulders'], 'side', 1, UNDER_CHEST),
  // One arm takes most of the weight, filmed from the front where both elbows
  // show. The chest drops off to one side of the phone, so no light sensor.
  camera('archerpushup', '🏹', ['chest', 'arms', 'shoulders'], 'front', 1.2),
  camera('dip', '🪑', ['arms', 'chest'], 'side', 0.6),

  // --- shoulders and arms
  camera('pikepushup', '🔺', ['shoulders', 'arms'], 'side', 1),
  camera('shoulderpress', '🏋️', ['shoulders', 'arms'], 'front', 0.4),
  camera('lateralraise', '🕊️', ['shoulders'], 'front', 0.3),
  camera('frontraise', '🙋', ['shoulders'], 'side', 0.3),
  camera('bicepcurl', '🥤', ['arms'], 'side', 0.3),
  hold('armcircles', '🌀', ['shoulders', 'arms'], 'front', 0.05),
  // Lying face down: the no-equipment pull for the upper back.
  camera('snowangel', '👼', ['back', 'shoulders'], 'side', 0.3),

  // --- legs and glutes
  camera('sumosquat', '🐸', ['legs', 'glutes'], 'front', 0.5),
  camera('lunge', '🚶', ['legs', 'glutes'], 'side', 0.5),
  camera('sidelunge', '↔️', ['legs', 'glutes'], 'front', 0.5),
  camera('splitsquat', '🦿', ['legs', 'glutes'], 'side', 0.5),
  hold('wallsit', '🧱', ['legs', 'glutes'], 'side', 0.1),
  camera('glutebridge', '🌉', ['glutes', 'back'], 'side', 0.3),
  camera('singlelegbridge', '🦩', ['glutes', 'legs'], 'side', 0.5),
  camera('donkeykick', '🐴', ['glutes'], 'side', 0.25),
  camera('firehydrant', '🚒', ['glutes'], 'front', 0.25),
  camera('goodmorning', '🙇‍♂️', ['back', 'legs', 'glutes'], 'side', 0.3),
  camera('singlelegrdl', '⚖️', ['glutes', 'legs', 'back'], 'side', 0.5),

  // --- core
  camera('crunch', '🔥', ['core'], 'side', 0.3),
  camera('legraise', '🦵', ['core'], 'side', 0.5),
  camera('bicyclecrunch', '🚲', ['core'], 'side', 0.25, BRISK),
  camera('mountainclimber', '🧗', ['core', 'cardio', 'shoulders'], 'side', 0.25, BRISK),
  camera('russiantwist', '🔄', ['core'], 'front', 0.2, { minRepMs: 350 }),
  hold('plank', '🪵', ['core', 'shoulders'], 'side', 0.1),
  hold('sideplank', '📏', ['core'], 'front', 0.1),
  hold('hollowhold', '🍌', ['core'], 'side', 0.1),
  hold('superman', '🦸', ['back', 'glutes'], 'side', 0.08),

  // --- cardio
  camera('highknees', '🏃', ['cardio', 'legs'], 'front', 0.15, BRISK),
  camera('buttkicks', '🍑', ['cardio', 'legs'], 'front', 0.15, BRISK),
  camera('burpee', '💥', ['cardio', 'chest', 'legs'], 'side', 1, { minRepMs: 1000 }),
];

export const EXERCISE_IDS = EXERCISES.map((e) => e.id);

/**
 * The exercises from before the library grew: the ones the blocker's rate
 * table lists and the all-rounder badge asks for.
 */
export const CLASSIC_EXERCISE_IDS = ['pushup', 'squat', 'situp', 'jumpingjack'];

/** The exercise with this id; anything unknown (or missing) is a push-up. */
export function getExercise(id) {
  return EXERCISES.find((e) => e.id === id) || EXERCISES[0];
}

/** Whether this exercise is a hold, counted in seconds rather than reps. */
export function isHold(id) {
  return getExercise(id).kind === HOLD;
}

/**
 * Which exercise a stored session was. Sessions saved before there was more
 * than one exercise carry no `exerciseId`, and they were all push-ups.
 */
export function exerciseOf(session) {
  return getExercise(session?.exerciseId).id;
}

/** Whether a stored session was a hold (its totalReps are seconds). */
export function isHoldSession(session) {
  return isHold(session?.exerciseId);
}

/** Sessions of one exercise; `null` or `'all'` keeps every session. */
export function filterByExercise(sessions, exerciseId) {
  if (!exerciseId || exerciseId === 'all') return sessions;
  return sessions.filter((s) => exerciseOf(s) === exerciseId);
}

/** Exercises that train a body part; `null` or `'all'` is every exercise. */
export function exercisesFor(part) {
  if (!part || part === 'all') return EXERCISES;
  return EXERCISES.filter((e) => e.parts.includes(part));
}

/** Whether `sourceId` can count `exerciseId`. */
export function supportsSource(exerciseId, sourceId) {
  return getExercise(exerciseId).sources.includes(sourceId);
}
