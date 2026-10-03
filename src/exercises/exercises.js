/**
 * The exercises the app can count.
 *
 * One table drives everything that differs between them: which detection
 * sources make sense, how much fun time a rep earns, the fastest believable
 * cadence, and what the motion source watches for. Screens, stats and the
 * pose page read from here, so adding an exercise starts in this file.
 *
 * Pure data and helpers, no React Native imports, so the Node suite and the
 * generated pose page can load it as is.
 *
 *   id            stable key, persisted on sessions and in settings
 *   icon          emoji shown next to the name
 *   sources       detection sources that work for it, best first
 *                 (ids from src/sensors/sources.js)
 *   creditWeight  fun time a rep earns, relative to a push-up. A jumping jack
 *                 is far less work than a push-up, and the blocker would be
 *                 trivial to cheat if it paid the same.
 *   minRepMs      fastest believable gap between two reps
 *   motion        motion-source rule: the phone's tilt away from where it was
 *                 when the set started. `nearDeg` or more is the bottom of a
 *                 rep, `farDeg` or less is back at the start; between the two
 *                 the state holds (hysteresis).
 *   program       whether the 6-week program and its max test use it
 *
 * Translation keys (src/i18n/strings.js) follow the id:
 *   exercise.<id>               name, e.g. "Squats"
 *   exercise.<id>.noun          lower-case plural for sentences, e.g. "squats"
 *   exercise.<id>.hint.<source> how to set up the phone for that source
 */

export const DEFAULT_EXERCISE_ID = 'pushup';

export const EXERCISES = [
  {
    id: 'pushup',
    icon: '💪',
    sources: ['ai', 'light', 'tap'],
    creditWeight: 1,
    minRepMs: 500,
    motion: null,
    program: true,
  },
  {
    id: 'squat',
    icon: '🦵',
    sources: ['ai', 'motion', 'tap'],
    creditWeight: 0.5,
    minRepMs: 500,
    // Phone in a front trouser pocket: the thigh goes from upright to roughly
    // level, about 80 degrees for a parallel squat, 50 for a half squat.
    motion: { nearDeg: 45, farDeg: 20 },
    program: false,
  },
  {
    id: 'situp',
    icon: '🧘',
    sources: ['ai', 'motion', 'tap'],
    creditWeight: 0.5,
    minRepMs: 500,
    // Phone held flat against the chest: the torso rises 60-80 degrees from
    // the floor on a full sit-up.
    motion: { nearDeg: 45, farDeg: 20 },
    program: false,
  },
  {
    id: 'jumpingjack',
    icon: '🤸',
    sources: ['ai', 'motion', 'tap'],
    creditWeight: 0.25,
    // A brisk jumping jack takes about 0.6 s; the push-up floor of 500 ms
    // would drop real reps.
    minRepMs: 350,
    // Phone held in one hand: the arm swings from the hip to overhead, so the
    // phone turns through 150 degrees or more.
    motion: { nearDeg: 100, farDeg: 50 },
    program: false,
  },
];

export const EXERCISE_IDS = EXERCISES.map((e) => e.id);

/** The exercise with this id; anything unknown (or missing) is a push-up. */
export function getExercise(id) {
  return EXERCISES.find((e) => e.id === id) || EXERCISES[0];
}

/**
 * Which exercise a stored session was. Sessions saved before there was more
 * than one exercise carry no `exerciseId`, and they were all push-ups.
 */
export function exerciseOf(session) {
  return getExercise(session?.exerciseId).id;
}

/** Sessions of one exercise; `null` or `'all'` keeps every session. */
export function filterByExercise(sessions, exerciseId) {
  if (!exerciseId || exerciseId === 'all') return sessions;
  return sessions.filter((s) => exerciseOf(s) === exerciseId);
}

/** Whether `sourceId` can count `exerciseId`. */
export function supportsSource(exerciseId, sourceId) {
  return getExercise(exerciseId).sources.includes(sourceId);
}
