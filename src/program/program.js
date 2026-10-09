/**
 * The training schedule (lịch tập): a 4-week program at three levels, a week
 * of five training days and two rest days that together work every muscle
 * group, built only from exercises the camera can count.
 *
 *   day 1  push      chest and triceps
 *   day 2  legs      legs and glutes
 *   day 3  core
 *   day 4  rest
 *   day 5  pull      back, biceps and shoulders
 *   day 6  cardio    full body
 *   day 7  rest
 *
 * Each day lists exercises in order, each with a number of sets and a target
 * per set: reps, or for a hold (plank, wall sit...) seconds. Week 1's targets
 * are the table below; every later week adds WEEKLY_GROWTH of them, so week 4
 * asks for about a third more than week 1.
 *
 * Pure and deterministic — a level, a week and a day fully define a workout —
 * so the whole program can be checked in plain Node and never has to be
 * stored. Only progress (which days are done) is persisted, keyed by
 * programDayKey(week, day).
 *
 * The days are not tied to the calendar: the next day is the first one not
 * done, so a missed Tuesday moves the week along rather than failing it.
 */

export const PROGRAM_LEVELS = ['beginner', 'intermediate', 'advanced'];
export const DEFAULT_PROGRAM_LEVEL = 'beginner';
export const PROGRAM_WEEKS = 4;
export const DAYS_PER_WEEK = 7;

/** Share of week 1's targets each later week adds. */
export const WEEKLY_GROWTH = 0.1;

/** What each day of the week trains; 'rest' days have no workout. */
export const WEEK_FOCUS = ['push', 'legs', 'core', 'rest', 'pull', 'cardio', 'rest'];

/** Sets per exercise and rest between sets, by level. */
const LEVEL_SHAPE = {
  beginner: { sets: 2, restSeconds: 60 },
  intermediate: { sets: 3, restSeconds: 45 },
  advanced: { sets: 3, restSeconds: 40 },
};

/**
 * Week-1 target per set, by focus and level: [exercise id, target]. A hold's
 * target is seconds. Alternating exercises (lunges, high knees...) count each
 * side, so their targets are both sides together.
 */
const DAY_TABLE = {
  push: {
    beginner: [['inclinepushup', 8], ['kneepushup', 8], ['dip', 6], ['plank', 20]],
    intermediate: [['pushup', 10], ['widepushup', 8], ['dip', 10], ['diamondpushup', 6]],
    advanced: [['declinepushup', 12], ['pushup', 15], ['diamondpushup', 10], ['dip', 15], ['widepushup', 12]],
  },
  legs: {
    beginner: [['squat', 12], ['glutebridge', 12], ['lunge', 8], ['wallsit', 20]],
    intermediate: [['squat', 15], ['lunge', 12], ['sumosquat', 12], ['glutebridge', 15], ['donkeykick', 12], ['wallsit', 30]],
    advanced: [['squat', 20], ['splitsquat', 12], ['sidelunge', 12], ['singlelegbridge', 12], ['firehydrant', 16], ['wallsit', 45]],
  },
  core: {
    beginner: [['crunch', 12], ['legraise', 8], ['bicyclecrunch', 12], ['plank', 20]],
    intermediate: [['crunch', 15], ['legraise', 12], ['bicyclecrunch', 20], ['russiantwist', 20], ['plank', 40], ['sideplank', 20]],
    advanced: [['situp', 20], ['legraise', 15], ['russiantwist', 30], ['bicyclecrunch', 30], ['hollowhold', 30], ['plank', 60], ['sideplank', 30]],
  },
  pull: {
    beginner: [['bicepcurl', 10], ['goodmorning', 10], ['superman', 15], ['lateralraise', 10], ['armcircles', 20]],
    intermediate: [['bicepcurl', 12], ['goodmorning', 12], ['superman', 25], ['shoulderpress', 10], ['lateralraise', 12], ['frontraise', 10]],
    advanced: [['bicepcurl', 15], ['goodmorning', 15], ['superman', 40], ['pikepushup', 8], ['shoulderpress', 15], ['lateralraise', 15], ['armcircles', 45]],
  },
  cardio: {
    beginner: [['jumpingjack', 20], ['highknees', 20], ['buttkicks', 20], ['mountainclimber', 12]],
    intermediate: [['jumpingjack', 30], ['highknees', 30], ['burpee', 6], ['mountainclimber', 20], ['buttkicks', 30]],
    advanced: [['burpee', 10], ['jumpingjack', 40], ['highknees', 40], ['mountainclimber', 30], ['squat', 20]],
  },
};

/**
 * Which exercises are holds. Spelled out here rather than imported, so this
 * module stays loadable on its own; the Node suite checks it against
 * src/exercises/exercises.js.
 */
export const PROGRAM_HOLD_IDS = ['armcircles', 'wallsit', 'plank', 'sideplank', 'hollowhold', 'superman'];

export function normalizeLevel(level) {
  return PROGRAM_LEVELS.includes(level) ? level : DEFAULT_PROGRAM_LEVEL;
}

/** The storage key of one day's progress. */
export function programDayKey(week, day) {
  return `${week}-${day}`;
}

/** The days of a week that have a workout, 1-based. */
export const TRAINING_DAYS = WEEK_FOCUS.map((focus, i) => (focus === 'rest' ? null : i + 1)).filter(Boolean);

export const TRAINING_DAYS_TOTAL = TRAINING_DAYS.length * PROGRAM_WEEKS;

/** A target grown for the week: reps to the nearest whole rep, holds to 5 seconds. */
function grow(base, week, hold) {
  const value = base * (1 + WEEKLY_GROWTH * (week - 1));
  return hold ? Math.max(5, Math.round(value / 5) * 5) : Math.max(1, Math.round(value));
}

/**
 * One day of the program.
 * @returns {{ level, week, day, focus, rest: boolean, restSeconds,
 *   items: Array<{ exerciseId, sets, target, hold }> }}
 * A rest day has no items.
 */
export function dayPlan(level, week, day) {
  const lv = normalizeLevel(level);
  const w = Math.min(PROGRAM_WEEKS, Math.max(1, Math.floor(week) || 1));
  const d = Math.min(DAYS_PER_WEEK, Math.max(1, Math.floor(day) || 1));
  const focus = WEEK_FOCUS[d - 1];
  const shape = LEVEL_SHAPE[lv];
  const items =
    focus === 'rest'
      ? []
      : DAY_TABLE[focus][lv].map(([exerciseId, base]) => {
          const hold = PROGRAM_HOLD_IDS.includes(exerciseId);
          return { exerciseId, sets: shape.sets, target: grow(base, w, hold), hold };
        });
  return { level: lv, week: w, day: d, focus, rest: focus === 'rest', restSeconds: shape.restSeconds, items };
}

/** The seven days of one week. */
export function weekPlan(level, week) {
  return Array.from({ length: DAYS_PER_WEEK }, (_, i) => dayPlan(level, week, i + 1));
}

/**
 * A day as the workout screen runs it: every set in order, each naming its
 * exercise, with the target for that set.
 */
export function planSets(plan) {
  const sets = [];
  for (const item of plan.items) {
    for (let i = 0; i < item.sets; i += 1) {
      sets.push({ exerciseId: item.exerciseId, target: item.target, hold: item.hold, max: false });
    }
  }
  return sets;
}

/** Totals for a day: sets, reps asked for, and seconds of holds. */
export function planTotals(plan) {
  let sets = 0;
  let reps = 0;
  let seconds = 0;
  for (const item of plan.items) {
    sets += item.sets;
    if (item.hold) seconds += item.sets * item.target;
    else reps += item.sets * item.target;
  }
  return { sets, reps, seconds, exercises: plan.items.length };
}

/** How many training days are done. */
export function countCompleted(completed = {}) {
  let n = 0;
  for (let week = 1; week <= PROGRAM_WEEKS; week += 1) {
    for (const day of TRAINING_DAYS) if (completed[programDayKey(week, day)]) n += 1;
  }
  return n;
}

/**
 * The next training day to do: the first one not done, in order. Null once
 * every day of every week is.
 * @param {Record<string, number>} completed  programDayKey -> timestamp
 */
export function nextProgramDay(completed = {}) {
  for (let week = 1; week <= PROGRAM_WEEKS; week += 1) {
    for (const day of TRAINING_DAYS) {
      if (!completed[programDayKey(week, day)]) return { week, day };
    }
  }
  return null;
}

/**
 * A run of the schedule folded into the badge counts it earned, for when it
 * is restarted or followed by the next level (src/storage/sessions.js,
 * loadScheduleEarned). `earned` is the earlier runs' counts, or null.
 */
export function addEarnedRun(earned, completed = {}) {
  const prev = earned || {};
  return {
    days: (prev.days || 0) + countCompleted(completed),
    weeks: (prev.weeks || 0) + weeksCompleted(completed),
    complete: (prev.complete || 0) + (isProgramComplete(completed) ? 1 : 0),
  };
}

export function isProgramComplete(completed = {}) {
  return nextProgramDay(completed) === null;
}

/** The week in progress: the next day's, or the last once everything is done. */
export function currentWeek(completed = {}) {
  return nextProgramDay(completed)?.week ?? PROGRAM_WEEKS;
}

/** Training days done in one week, out of how many. */
export function weekProgress(completed = {}, week) {
  const done = TRAINING_DAYS.filter((day) => completed[programDayKey(week, day)]).length;
  return { done, total: TRAINING_DAYS.length };
}

/** Weeks with every training day done. */
export function weeksCompleted(completed = {}) {
  let n = 0;
  for (let week = 1; week <= PROGRAM_WEEKS; week += 1) {
    const { done, total } = weekProgress(completed, week);
    if (done === total) n += 1;
  }
  return n;
}

/** Every exercise the program uses, in first-use order. */
export function programExerciseIds() {
  const ids = [];
  for (const focus of Object.keys(DAY_TABLE)) {
    for (const level of PROGRAM_LEVELS) {
      for (const [id] of DAY_TABLE[focus][level]) if (!ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}
