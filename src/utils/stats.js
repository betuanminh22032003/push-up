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

  for (const s of sessions) {
    const reps = s.totalReps || 0;
    totalReps += reps;
    totalSeconds += s.durationSeconds || 0;
    if (reps > bestSession) bestSession = reps;
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

  return {
    totalReps,
    todayReps,
    streak,
    totalSeconds,
    sessionCount: sessions.length,
    bestSession,
    activeDays: repsByDay.size,
  };
}
