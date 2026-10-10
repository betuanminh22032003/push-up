import { BODY_PARTS, getExercise } from '../exercises/exercises';
import { dayKey } from './time';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** The muscle groups counted for weekly sets: every body part but cardio. */
export const MUSCLE_PARTS = BODY_PARTS.filter((p) => p !== 'cardio');

/**
 * The last seven days of training, set against the WHO 2020 guideline
 * (muscle-strengthening on 2+ days, 150–300 minutes of moderate activity a
 * week) and against weekly sets per muscle group (about 4 is the least that
 * works, about 10+ the range for growth: Iversen 2021, Schoenfeld 2017).
 *
 *   strengthDays  days with at least one set of a non-cardio exercise
 *   minutes       time spent in sets, all exercises, rounded down
 *   sets          { [part]: sets } — each set credited to its exercise's
 *                 main body part only, so the count is never inflated
 *
 * Every set counts, hard or easy: the app cannot tell how close to failure a
 * set ended, so the sets figure is an upper bound on hard sets.
 */
export function weekTraining(sessions, now = Date.now()) {
  const since = now - WEEK_MS;
  const days = new Set();
  const sets = Object.fromEntries(MUSCLE_PARTS.map((p) => [p, 0]));
  let seconds = 0;
  for (const s of sessions || []) {
    if (!s || !(s.timestamp > since) || s.timestamp > now) continue;
    seconds += Math.max(0, s.durationSeconds || 0);
    const main = getExercise(s.exerciseId).parts[0];
    if (main === 'cardio') continue;
    days.add(dayKey(s.timestamp));
    sets[main] += Array.isArray(s.sets) && s.sets.length ? s.sets.length : 1;
  }
  return { strengthDays: days.size, minutes: Math.floor(seconds / 60), sets };
}
