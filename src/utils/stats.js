import { dayKey, shiftDayKey } from './time';

/**
 * Derive all displayed stats from the raw session list in one pass.
 * Pure + synchronous so it can be memoised and unit-tested without RN.
 */
export function computeStats(sessions, now = Date.now()) {
  const todayKey = dayKey(now);
  const repsByDay = new Map();
  let totalReps = 0;
  let totalSeconds = 0;
  let bestSession = 0;
  let bestSet = 0;

  for (const s of sessions) {
    const reps = s.totalReps || 0;
    totalReps += reps;
    totalSeconds += s.durationSeconds || 0;
    if (reps > bestSession) bestSession = reps;
    // Records written before sets existed are one set each.
    const sets = Array.isArray(s.sets) && s.sets.length ? s.sets : [{ reps }];
    for (const set of sets) if ((set.reps || 0) > bestSet) bestSet = set.reps;
    // Days are only "done" if at least one rep landed — a 0-rep session must not
    // keep a streak alive.
    if (reps > 0) {
      const key = dayKey(s.timestamp);
      repsByDay.set(key, (repsByDay.get(key) || 0) + reps);
    }
  }

  const todayReps = repsByDay.get(todayKey) || 0;

  // Streak counts back from today; if today is still empty we start from
  // yesterday so an unfinished day doesn't read as a broken streak.
  let cursor = repsByDay.has(todayKey) ? 0 : -1;
  let streak = 0;
  while (repsByDay.has(shiftDayKey(now, cursor))) {
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
    sessionCount: sessions.length,
    bestSession,
    bestSet,
    bestDay,
    activeDays: repsByDay.size,
  };
}

/**
 * Reps per local day for the last `days` days, oldest first, ending today.
 * Empty days are present as zeros so a chart always has a full row of bars.
 * @returns {Array<{ key: string, reps: number, offset: number }>}  offset 0 = today
 */
export function dailyTotals(sessions, days = 7, now = Date.now()) {
  const repsByDay = new Map();
  for (const s of sessions) {
    const reps = s.totalReps || 0;
    if (reps <= 0) continue;
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
