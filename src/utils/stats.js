import { dayKey, shiftDayKey } from './time';

/**
 * Which sessions a tally adds up. A hold's "reps" are seconds (a 60-second
 * plank stores 60), which must not be added to anyone's push-up count, so
 * the rep tallies skip holds and the seconds tallies count only holds.
 *
 *   isHold  (session) -> boolean; left out, nothing is a hold, as before there
 *           were any. Passed in rather than imported so this module stays
 *           loadable on its own (src/exercises/exercises.js has isHoldSession).
 *   unit    'reps' (the default) or 'seconds'
 */
function counts({ isHold = () => false, unit = 'reps' } = {}) {
  return unit === 'seconds' ? (s) => isHold(s) : (s) => !isHold(s);
}

/**
 * How many workouts the sessions are. A workout of several exercises (a
 * schedule day) saves one session per exercise, all with the same
 * `workoutId`; every other session is a workout of its own.
 */
export function countWorkouts(sessions) {
  const ids = new Set();
  for (const s of sessions) ids.add(s.workoutId ? `w:${s.workoutId}` : `s:${s.id}`);
  return ids.size;
}

/**
 * Derive all displayed stats from the raw session list in one pass.
 * Pure + synchronous so it can be memoised and unit-tested without RN.
 *
 * Totals, today, best set/session/day are in the chosen unit (see `counts`).
 * Streaks, active days, the workout count and the time trained count every
 * session: a day of planks is a day trained. `sessionCount` is workouts, as
 * `countWorkouts` counts them.
 */
export function computeStats(sessions, now = Date.now(), options) {
  const counted = counts(options);
  const todayKey = dayKey(now);
  const repsByDay = new Map();
  const activeDays = new Set();
  let totalReps = 0;
  let totalSeconds = 0;
  let bestSession = 0;
  let bestSet = 0;

  for (const s of sessions) {
    const reps = s.totalReps || 0;
    totalSeconds += s.durationSeconds || 0;
    // Days are only "done" if at least one rep landed — a 0-rep session must not
    // keep a streak alive.
    if (reps > 0) activeDays.add(dayKey(s.timestamp));
    if (!counted(s)) continue;
    totalReps += reps;
    if (reps > bestSession) bestSession = reps;
    // Records written before sets existed are one set each.
    const sets = Array.isArray(s.sets) && s.sets.length ? s.sets : [{ reps }];
    for (const set of sets) if ((set?.reps || 0) > bestSet) bestSet = set.reps;
    if (reps > 0) {
      const key = dayKey(s.timestamp);
      repsByDay.set(key, (repsByDay.get(key) || 0) + reps);
    }
  }

  const todayReps = repsByDay.get(todayKey) || 0;

  // Streak counts back from today; if today is still empty we start from
  // yesterday so an unfinished day doesn't read as a broken streak.
  let cursor = activeDays.has(todayKey) ? 0 : -1;
  let streak = 0;
  while (activeDays.has(shiftDayKey(now, cursor))) {
    streak += 1;
    cursor -= 1;
  }

  let bestDay = 0;
  for (const reps of repsByDay.values()) if (reps > bestDay) bestDay = reps;

  return {
    totalReps,
    todayReps,
    streak,
    totalSeconds,
    sessionCount: countWorkouts(sessions),
    bestSession,
    bestSet,
    bestDay,
    activeDays: activeDays.size,
  };
}

/**
 * Reps (or, with unit 'seconds', seconds held) per local day for the last
 * `days` days, oldest first, ending today. Empty days are present as zeros so
 * a chart always has a full row of bars.
 * @returns {Array<{ key: string, reps: number, offset: number }>}  offset 0 = today
 */
export function dailyTotals(sessions, days = 7, now = Date.now(), options) {
  const counted = counts(options);
  const repsByDay = new Map();
  for (const s of sessions) {
    const reps = s.totalReps || 0;
    if (reps <= 0 || !counted(s)) continue;
    const key = dayKey(s.timestamp);
    repsByDay.set(key, (repsByDay.get(key) || 0) + reps);
  }
  const out = [];
  for (let offset = -(days - 1); offset <= 0; offset += 1) {
    const key = shiftDayKey(now, offset);
    out.push({ key, offset, reps: repsByDay.get(key) || 0 });
  }
  return out;
}
