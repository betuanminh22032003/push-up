import { dayKey, shiftDayKey } from '../utils/time';
import { PROGRAM_DAYS } from '../program/program';
import { EXERCISE_IDS, exerciseOf } from '../exercises/exercises';

/**
 * Achievements derived from history, never stored. Recomputing from the data
 * means they can never drift from it, and deleting a session honestly takes a
 * badge away if it was the one that earned it.
 *
 * Each has an `id` (the translation key stem) and a `test(facts)`; the facts
 * are computed once per evaluation below. The grid shows them in this order,
 * so new ones are added at the end.
 *
 * The rep and set badges are push-ups only (their copy says push-ups, and a
 * jumping jack is far less work); the other exercises have their own totals.
 * Workouts, streaks, the time of day and the program count every exercise.
 */
export const ACHIEVEMENTS = [
  { id: 'first_workout', icon: '🏁', test: (f) => f.sessions >= 1 },
  { id: 'reps_100', icon: '💯', test: (f) => f.totalReps >= 100 },
  { id: 'reps_500', icon: '🔥', test: (f) => f.totalReps >= 500 },
  { id: 'reps_1000', icon: '⚡', test: (f) => f.totalReps >= 1000 },
  { id: 'reps_5000', icon: '🏆', test: (f) => f.totalReps >= 5000 },
  { id: 'set_25', icon: '💪', test: (f) => f.bestSet >= 25 },
  { id: 'set_50', icon: '🦾', test: (f) => f.bestSet >= 50 },
  { id: 'set_100', icon: '👑', test: (f) => f.bestSet >= 100 },
  { id: 'streak_3', icon: '📅', test: (f) => f.longestStreak >= 3 },
  { id: 'streak_7', icon: '🗓️', test: (f) => f.longestStreak >= 7 },
  { id: 'streak_30', icon: '🌟', test: (f) => f.longestStreak >= 30 },
  { id: 'workouts_10', icon: '🔟', test: (f) => f.sessions >= 10 },
  { id: 'workouts_50', icon: '🎖️', test: (f) => f.sessions >= 50 },
  { id: 'early_bird', icon: '🌅', test: (f) => f.earliestHour !== null && f.earliestHour < 7 },
  { id: 'night_owl', icon: '🌙', test: (f) => f.latestHour !== null && f.latestHour >= 22 },
  { id: 'program_day', icon: '📘', test: (f) => f.programDays >= 1 },
  { id: 'program_done', icon: '🎓', test: (f) => f.programDays >= PROGRAM_DAYS },
  { id: 'squats_100', icon: '🦵', test: (f) => f.repsByExercise.squat >= 100 },
  { id: 'situps_100', icon: '🧘', test: (f) => f.repsByExercise.situp >= 100 },
  { id: 'jacks_200', icon: '🤸', test: (f) => f.repsByExercise.jumpingjack >= 200 },
  {
    id: 'all_rounder',
    icon: '🏅',
    test: (f) => EXERCISE_IDS.every((id) => f.repsByExercise[id] > 0),
  },
];

/** Longest run of consecutive local days with at least one rep. */
export function longestStreak(sessions) {
  const days = new Set();
  for (const s of sessions) if ((s.totalReps || 0) > 0) days.add(dayKey(s.timestamp));
  let best = 0;
  for (const key of days) {
    // Only count from the start of a run, so each run is measured once.
    const [y, m, d] = key.split('-').map(Number);
    const start = new Date(y, m - 1, d, 12).getTime();
    if (days.has(shiftDayKey(start, -1))) continue;
    let length = 1;
    while (days.has(shiftDayKey(start, length))) length += 1;
    if (length > best) best = length;
  }
  return best;
}

/** Best single set across history; old records without sets count as one set. */
export function bestSetReps(sessions) {
  let best = 0;
  for (const s of sessions) {
    const sets = Array.isArray(s.sets) && s.sets.length ? s.sets : [{ reps: s.totalReps || 0 }];
    for (const set of sets) if ((set.reps || 0) > best) best = set.reps;
  }
  return best;
}

/**
 * What the tests read, from one pass over the history. `totalReps` and
 * `bestSet` are push-ups; `repsByExercise` has every exercise's total, zero
 * included. Sessions saved before there were exercises carry no
 * `exerciseId` and are push-ups, the same rule as everywhere (`exerciseOf`).
 */
export function computeFacts(sessions, completedProgramDays = {}) {
  const repsByExercise = Object.fromEntries(EXERCISE_IDS.map((id) => [id, 0]));
  const pushups = [];
  let earliestHour = null;
  let latestHour = null;
  for (const s of sessions) {
    const exercise = exerciseOf(s);
    repsByExercise[exercise] += s.totalReps || 0;
    if (exercise === 'pushup') pushups.push(s);
    if ((s.totalReps || 0) > 0) {
      const hour = new Date(s.timestamp).getHours();
      if (earliestHour === null || hour < earliestHour) earliestHour = hour;
      if (latestHour === null || hour > latestHour) latestHour = hour;
    }
  }
  return {
    sessions: sessions.length,
    totalReps: repsByExercise.pushup,
    bestSet: bestSetReps(pushups),
    repsByExercise,
    longestStreak: longestStreak(sessions),
    earliestHour,
    latestHour,
    programDays: Object.keys(completedProgramDays).length,
  };
}

/** Ids of every achievement earned by this history, in definition order. */
export function unlockedAchievements(sessions, completedProgramDays = {}) {
  const facts = computeFacts(sessions, completedProgramDays);
  return ACHIEVEMENTS.filter((a) => a.test(facts)).map((a) => a.id);
}

/** Ids newly earned between two histories — what to celebrate after a save. */
export function newlyUnlocked(before, after) {
  const had = new Set(before);
  return after.filter((id) => !had.has(id));
}
