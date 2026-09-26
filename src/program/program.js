/**
 * The 6-week push-up program: 18 workouts, 5 sets each, scaled to a level
 * picked by a one-set max test.
 *
 * Pure and deterministic — a level and a day number fully define a workout —
 * so the whole program can be checked in plain Node and never has to be
 * stored. Only progress (which days are done) is persisted.
 *
 * Progression is geometric-ish per level: a beginner's sets roughly triple by
 * week 6, a strong starter's roughly double. That mirrors how the classic
 * "hundred push-ups" style plans taper growth for stronger starters, since a
 * set of 25 does not grow as fast as a set of 4.
 */

export const PROGRAM_DAYS = 18;
export const DAYS_PER_WEEK = 3;
export const PROGRAM_WEEKS = PROGRAM_DAYS / DAYS_PER_WEEK;
export const SETS_PER_DAY = 5;

/**
 * Levels by one-set max on the entry test.
 *   base    reps in the first set of day 1
 *   growth  per-day growth rate of the set targets
 */
export const LEVELS = [
  { id: 1, maxTest: 5, base: 4, growth: 0.12 },
  { id: 2, maxTest: 10, base: 7, growth: 0.11 },
  { id: 3, maxTest: 20, base: 11, growth: 0.09 },
  { id: 4, maxTest: 35, base: 17, growth: 0.075 },
  { id: 5, maxTest: Infinity, base: 25, growth: 0.06 },
];

/** Relative size of each set; the last is a "max" set with a floor. */
const SET_WEIGHTS = [1, 1, 0.85, 0.85, 1.2];

/** Rest between sets, by week. Longer rests as the sets get heavier. */
const REST_BY_WEEK = [60, 60, 90, 90, 120, 120];

export function levelForTest(reps) {
  const n = Math.max(0, Math.floor(Number(reps) || 0));
  return LEVELS.find((l) => n <= l.maxTest).id;
}

export function getLevel(id) {
  return LEVELS.find((l) => l.id === id) || LEVELS[0];
}

export function weekOfDay(day) {
  return Math.floor((day - 1) / DAYS_PER_WEEK) + 1;
}

/**
 * @returns {{ day, week, level, restSeconds, sets: Array<{ target: number, max: boolean }> }}
 * `target` is the reps to reach; a `max` set means "at least target, then as
 * many as you can", so it is never auto-completed.
 */
export function dayPlan(levelId, day) {
  const d = Math.min(PROGRAM_DAYS, Math.max(1, Math.floor(day)));
  const level = getLevel(levelId);
  const factor = 1 + level.growth * (d - 1);
  const sets = SET_WEIGHTS.map((w, i) => ({
    target: Math.max(1, Math.round(level.base * factor * w)),
    max: i === SET_WEIGHTS.length - 1,
  }));
  const week = weekOfDay(d);
  return { day: d, week, level: level.id, restSeconds: REST_BY_WEEK[week - 1], sets };
}

export function totalTargetReps(plan) {
  return plan.sets.reduce((sum, s) => sum + s.target, 0);
}

/** Full program for a level: all 18 days, for the program screen. */
export function programFor(levelId) {
  const days = [];
  for (let day = 1; day <= PROGRAM_DAYS; day += 1) days.push(dayPlan(levelId, day));
  return days;
}

/**
 * The next day to do: the first one not completed. Null once every day is done.
 * @param {Record<number, number>} completedDays  day -> timestamp
 */
export function nextDay(completedDays = {}) {
  for (let day = 1; day <= PROGRAM_DAYS; day += 1) {
    if (!completedDays[day]) return day;
  }
  return null;
}

export function isProgramComplete(completedDays = {}) {
  return nextDay(completedDays) === null;
}
