/**
 * The training schedule (lịch tập): 4-week cycles of three full-body strength
 * days and two short cardio days a week, built only from exercises that need
 * nothing but the floor and that the camera can count.
 *
 * Why it is shaped this way (sources in research/chuyen-mon-lich-tap.md):
 *
 *   - every major muscle group twice a week or more (WHO 2020; ACSM 2026;
 *     Schoenfeld 2016), so full-body days A and B rather than one body part a
 *     day: A–cardio–B–rest–A–cardio–rest, and B–A–B the week after
 *   - the hardest multi-joint exercise first, holds and core last (ACSM 2009;
 *     Simão 2012); the lead exercise alternates between A and B (Nunes 2021)
 *   - a short warm-up before every strength day (RAMP; Fradkin 2010)
 *   - rest by effort: longer after the main exercises, short after holds
 *     (Grgic 2018; Singer 2024)
 *   - each exercise slot climbs a ladder of harder variations, and its target
 *     follows the reps the camera actually counted (double progression, ACSM
 *     2009; autoregulation, Zhang 2021): the last set of a rep exercise is
 *     "as many as you can", and that set decides the next target
 *
 * A slot (`hpush`, `squat`...) is one movement pattern. Its state — which rung
 * of its ladder and the reps (or seconds) asked per set — lives in the stored
 * schedule as `slots`; a day plan is built from the level, the week, the day
 * and those states. Days A and B share slots, so both exposures of a pattern
 * move the same target.
 *
 * Pure and deterministic, so the whole program can be checked in plain Node.
 * The days are not tied to the calendar: the next day is the first one not
 * done, so a missed Tuesday moves the week along rather than failing it.
 */

export const PROGRAM_LEVELS = ['beginner', 'intermediate', 'advanced'];
export const DEFAULT_PROGRAM_LEVEL = 'beginner';
export const PROGRAM_WEEKS = 4;
export const DAYS_PER_WEEK = 7;

/** Share of week 1's targets each later week adds — cardio days only; strength follows the reps. */
export const WEEKLY_GROWTH = 0.1;

/** What each day of week 1 trains; 'rest' days have no workout. Even weeks swap A and B. */
export const WEEK_FOCUS = ['fullA', 'cardio', 'fullB', 'rest', 'fullA', 'cardio', 'rest'];

/**
 * The movement patterns, each a ladder from easiest to hardest, with the
 * per-set range its target moves in: reps, or seconds for a hold. Upper body
 * 6–12, lower body 10–20, core 8–15, holds 20–60 s.
 *
 *   role  'main'  multi-joint, worked hard: longer rest, last set as many as you can
 *         'aux'   the rest of the strength work
 *         'hold'  isometric, timed, at the end of the day
 */
export const SLOTS = {
  hpush: {
    ladder: ['inclinepushup', 'kneepushup', 'pushup', 'diamondpushup', 'declinepushup', 'archerpushup'],
    range: [6, 12],
    role: 'main',
  },
  vpush: { ladder: ['pikepushup'], range: [5, 12], role: 'main' },
  squat: { ladder: ['squat', 'splitsquat', 'lunge'], range: [10, 20], role: 'main' },
  bridge: { ladder: ['glutebridge', 'singlelegbridge'], range: [10, 20], role: 'aux' },
  hinge: { ladder: ['goodmorning', 'singlelegrdl'], range: [8, 15], role: 'aux' },
  back: { ladder: ['snowangel'], range: [8, 15], role: 'aux' },
  backHold: { ladder: ['superman'], range: [20, 60], role: 'hold' },
  core: { ladder: ['crunch', 'situp', 'legraise'], range: [8, 15], role: 'aux' },
  coreHold: { ladder: ['plank', 'sideplank', 'hollowhold'], range: [20, 60], role: 'hold' },
};

/** Day A leads with the push, day B with the legs; `push2` is a pike once a full push-up is in reach. */
const DAY_SLOTS = {
  fullA: ['hpush', 'squat', 'back', 'bridge', 'coreHold'],
  fullB: ['squat', 'push2', 'hinge', 'backHold', 'core'],
};

/** The rung of hpush from which the second push of the week is a pike push-up. */
const PIKE_FROM_RUNG = SLOTS.hpush.ladder.indexOf('pushup');

/** Sets per exercise, and rest after a set by role, by level. */
const LEVEL_SHAPE = {
  beginner: { sets: 2, mainSets: 2, rest: { main: 60, aux: 45, hold: 30 } },
  intermediate: { sets: 3, mainSets: 3, rest: { main: 75, aux: 45, hold: 30 } },
  advanced: { sets: 3, mainSets: 4, rest: { main: 90, aux: 60, hold: 30 } },
};

const WARMUP_REST = 15;
const CARDIO_REST = 30;

/** Where each slot starts at each level, before any test or workout: [rung, target]. */
const LEVEL_START = {
  beginner: {
    hpush: [0, 8], vpush: [0, 5], squat: [0, 12], bridge: [0, 12], hinge: [0, 10],
    back: [0, 8], backHold: [0, 20], core: [0, 10], coreHold: [0, 20],
  },
  intermediate: {
    hpush: [2, 8], vpush: [0, 6], squat: [0, 16], bridge: [0, 16], hinge: [1, 8],
    back: [0, 10], backHold: [0, 30], core: [1, 10], coreHold: [0, 40],
  },
  advanced: {
    hpush: [3, 8], vpush: [0, 8], squat: [1, 12], bridge: [1, 12], hinge: [1, 10],
    back: [0, 12], backHold: [0, 40], core: [2, 10], coreHold: [1, 30],
  },
};

/**
 * Cardio days, by level: [exercise id, target]. Jump-free when the user asked
 * for low impact (pregnancy, sore joints). Targets grow WEEKLY_GROWTH a week.
 */
const CARDIO_TABLE = {
  beginner: [['jumpingjack', 20], ['highknees', 20], ['buttkicks', 20], ['mountainclimber', 12]],
  intermediate: [['jumpingjack', 30], ['highknees', 30], ['burpee', 6], ['mountainclimber', 20], ['buttkicks', 30]],
  advanced: [['burpee', 10], ['jumpingjack', 40], ['highknees', 40], ['mountainclimber', 30], ['squat', 20]],
};
const LOW_IMPACT_CARDIO = {
  beginner: [['squat', 12], ['mountainclimber', 10], ['sumosquat', 12], ['bicyclecrunch', 12]],
  intermediate: [['squat', 20], ['mountainclimber', 16], ['sumosquat', 16], ['bicyclecrunch', 20], ['lunge', 12]],
  advanced: [['squat', 25], ['mountainclimber', 24], ['sumosquat', 20], ['bicyclecrunch', 30], ['lunge', 16]],
};

/**
 * Which exercises are holds. Spelled out here rather than imported, so this
 * module stays loadable on its own; the Node suite checks it against
 * src/exercises/exercises.js.
 */
export const PROGRAM_HOLD_IDS = ['armcircles', 'wallsit', 'plank', 'sideplank', 'hollowhold', 'superman'];

const isHoldId = (id) => PROGRAM_HOLD_IDS.includes(id);

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

/** What a day trains: week 1's layout, with A and B swapped in even weeks. */
export function focusOf(week, day) {
  const focus = WEEK_FOCUS[day - 1];
  if (week % 2 === 0 && focus === 'fullA') return 'fullB';
  if (week % 2 === 0 && focus === 'fullB') return 'fullA';
  return focus;
}

/* --- slot states ------------------------------------------------------------- */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round5 = (v) => Math.round(v / 5) * 5;

/** The step a target moves by: a rep, or five seconds for a hold. */
function stepOf(slotId) {
  return SLOTS[slotId].role === 'hold' ? 5 : 1;
}

/** The highest a target goes on the ladder's last rung, where there is nowhere harder to go. */
function ceilingOf(slotId) {
  const [, hi] = SLOTS[slotId].range;
  return SLOTS[slotId].role === 'hold' ? 90 : Math.round(hi * 1.5);
}

/** One slot's state, made valid: a known rung, a target in a sane range. */
export function normalizeSlot(slotId, state) {
  const def = SLOTS[slotId];
  const [lo] = def.range;
  const rung = clamp(Math.floor(Number(state?.rung) || 0), 0, def.ladder.length - 1);
  let target = Number.isFinite(state?.target) ? Math.round(state.target) : lo;
  target = clamp(target, def.role === 'hold' ? 10 : 3, ceilingOf(slotId));
  if (def.role === 'hold') target = round5(target);
  return {
    rung,
    target,
    top: Math.max(0, Math.floor(Number(state?.top) || 0)),
    misses: Math.max(0, Math.floor(Number(state?.misses) || 0)),
    lastAt: Number.isFinite(state?.lastAt) ? state.lastAt : null,
  };
}

/** Every slot at the level's starting point. */
export function startingSlots(level) {
  const start = LEVEL_START[normalizeLevel(level)];
  return Object.fromEntries(
    Object.keys(SLOTS).map((id) => [id, normalizeSlot(id, { rung: start[id][0], target: start[id][1] })]),
  );
}

/** Stored slots filled in from the level wherever one is missing or broken. */
export function slotsFor(level, stored) {
  const base = startingSlots(level);
  if (!stored || typeof stored !== 'object') return base;
  for (const id of Object.keys(SLOTS)) {
    if (stored[id] && typeof stored[id] === 'object') base[id] = normalizeSlot(id, stored[id]);
  }
  return base;
}

/** The exercise a slot is on now. */
export function slotExercise(slotId, state) {
  const { ladder } = SLOTS[slotId];
  return ladder[clamp(state?.rung ?? 0, 0, ladder.length - 1)];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A slot's target for today: after a week or two off, a little less (back
 * into it gently); after longer, a retest is the better guide (see
 * `needsRetest`), and until then a fifth less.
 */
export function targetToday(slotId, state, now) {
  if (!state?.lastAt || !Number.isFinite(now)) return state.target;
  const days = (now - state.lastAt) / DAY_MS;
  const factor = days > 14 ? 0.8 : days >= 8 ? 0.9 : 1;
  if (factor === 1) return state.target;
  const [lo] = SLOTS[slotId].range;
  const value = Math.max(Math.min(lo, state.target), state.target * factor);
  return SLOTS[slotId].role === 'hold' ? Math.max(10, round5(value)) : Math.max(3, Math.round(value));
}

/** More than two weeks since any strength slot was trained: test again before going on. */
export function needsRetest(slots, now) {
  const last = Math.max(0, ...Object.values(slots || {}).map((s) => s?.lastAt || 0));
  return last > 0 && Number.isFinite(now) && now - last > 14 * DAY_MS;
}

/**
 * The next state of a slot after a day's sets of it.
 *
 * @param {string} slotId
 * @param {object} state      the slot as it was (normalizeSlot)
 * @param {number[]} results  reps (or seconds) of each set, in order; for a
 *                            rep slot the last one was "as many as you can"
 * @param {number} [at]       when, for the comeback rule
 * @returns {{ state, change }} change: 'up' (target rose), 'rung' (a harder
 *   variation), 'same', 'down' (target eased), 'rungDown' (an easier variation)
 *
 * The rules (ACSM 2009's "1–2 reps over the target, then progress", the
 * r/bodyweightfitness Recommended Routine's ladder, Hundred Pushups' repeat):
 *   - every set reached the target and the last went 3+ past it: +1 (+2 when
 *     6+ past); a hold adds 5 s once every set held the target
 *   - at the top of the range two sessions running: the next rung, from the
 *     bottom of the range
 *   - every set reached but no more: the same again
 *   - a set fell short: the same again; short twice running, 10% less, and
 *     below the range an easier rung
 * The thresholds are engineering choices, not trial results; see the research
 * notes.
 */
export function progressSlot(slotId, state, results, at = null) {
  const def = SLOTS[slotId];
  const [lo, hi] = def.range;
  const hold = def.role === 'hold';
  const s = normalizeSlot(slotId, state);
  const done = (results || []).filter((r) => Number.isFinite(r) && r >= 0);
  if (!done.length) return { state: s, change: 'same' };
  const next = { ...s, lastAt: Number.isFinite(at) ? at : s.lastAt };
  const T = s.target;
  const allMet = done.every((r) => r >= T);
  const last = done[done.length - 1];
  const step = stepOf(slotId);
  const lastRung = s.rung >= def.ladder.length - 1;

  if (allMet) {
    next.misses = 0;
    // A rep slot moves on only when the last set showed reps to spare; a hold, once every set held.
    const spare = hold ? Infinity : last - T;
    if (!hold && spare < 3) return { state: next, change: 'same' };
    if (T >= hi && !lastRung) {
      next.top = s.top + 1;
      if (next.top >= 2) {
        return { state: { ...next, rung: s.rung + 1, target: lo, top: 0 }, change: 'rung' };
      }
      return { state: next, change: 'same' };
    }
    const inc = hold ? step : spare >= 6 ? 2 : 1;
    const target = Math.min(lastRung ? ceilingOf(slotId) : hi, T + inc);
    if (target === T) return { state: next, change: 'same' };
    return { state: { ...next, target, top: 0 }, change: 'up' };
  }

  next.top = 0;
  next.misses = s.misses + 1;
  if (next.misses < 2) return { state: next, change: 'same' };
  next.misses = 0;
  const eased = hold ? round5(T * 0.9) : Math.round(T * 0.9);
  if (eased >= lo || s.rung === 0) {
    const target = Math.max(hold ? 10 : 3, Math.min(T - step, eased));
    return { state: { ...next, target }, change: 'down' };
  }
  return { state: { ...next, rung: s.rung - 1, target: hold ? round5((lo + hi) / 2) : lo + 2 }, change: 'rungDown' };
}

/* --- placement test ---------------------------------------------------------- */

/** The placement test: one set each, as many as you can (a hold: as long as you can). */
export const TEST_ITEMS = ['pushup', 'squat', 'glutebridge', 'plank'];

/**
 * The test as the workout screen runs it. With `cautious` (a yes on the
 * health check) the plank is left out: a maximal hold is not a first-day job.
 */
export function testPlan({ cautious = false } = {}) {
  const ids = cautious ? TEST_ITEMS.filter((id) => id !== 'plank') : TEST_ITEMS;
  return {
    kind: 'program',
    test: true,
    restSeconds: 90,
    items: ids.map((exerciseId) => ({ exerciseId, sets: 1, target: 1, hold: isHoldId(exerciseId), max: true })),
    sets: ids.map((exerciseId) => ({
      exerciseId,
      target: 1,
      hold: isHoldId(exerciseId),
      max: true,
      rest: 90,
      role: 'test',
    })),
  };
}

/** Starting rung and target from a tested maximum: 60% of it per set, a rung up if that tops the range. */
function placeFromMax(slotId, rung, max) {
  const [lo, hi] = SLOTS[slotId].range;
  const per = Math.round(0.6 * max);
  if (per > hi && rung < SLOTS[slotId].ladder.length - 1) return { rung: rung + 1, target: lo };
  return { rung, target: clamp(per, lo, hi) };
}

/**
 * Level and slots from a placement test (coaching convention, not a trial:
 * start each set at about 60% of the tested maximum; hold half the longest
 * hold).
 * @param {{ pushup?, squat?, glutebridge?, plank? }} results  max reps; plank in seconds
 */
export function slotsFromTest(results = {}) {
  const push = Math.max(0, Math.round(results.pushup || 0));
  const level = push >= 25 ? 'advanced' : push >= 10 ? 'intermediate' : 'beginner';
  const slots = startingSlots(level);
  const set = (id, value) => {
    slots[id] = normalizeSlot(id, value);
  };

  const pushRung = SLOTS.hpush.ladder.indexOf('pushup');
  if (push >= 5) set('hpush', placeFromMax('hpush', pushRung, push));
  else if (push >= 1) set('hpush', { rung: SLOTS.hpush.ladder.indexOf('kneepushup'), target: 8 });
  else set('hpush', { rung: 0, target: 8 });

  if (Number.isFinite(results.squat)) set('squat', placeFromMax('squat', 0, results.squat));
  if (Number.isFinite(results.glutebridge)) set('bridge', placeFromMax('bridge', 0, results.glutebridge));
  // A strong bridge or squat is ready for the single-leg hinge.
  const strongLegs = slots.bridge.rung > 0 || slots.squat.rung > 0;
  set('hinge', strongLegs ? { rung: 1, target: 8 } : { rung: 0, target: 10 });

  if (Number.isFinite(results.plank)) {
    const half = round5(results.plank / 2);
    set('coreHold', half > 60 ? { rung: 1, target: 30 } : { rung: 0, target: clamp(half, 20, 60) });
    set('core', results.plank >= 90 ? { rung: 2, target: 8 } : results.plank >= 45 ? { rung: 1, target: 10 } : { rung: 0, target: 10 });
  }
  return { level, slots };
}

/* --- day plans ---------------------------------------------------------------- */

/** A target grown for the week: reps to the nearest whole rep, holds to 5 seconds. */
function grow(base, week, hold) {
  const value = base * (1 + WEEKLY_GROWTH * (week - 1));
  return hold ? Math.max(5, Math.round(value / 5) * 5) : Math.max(1, Math.round(value));
}

/** The slot a day position trains: `push2` is the pike once a full push-up is in reach. */
function resolveSlot(position, slots) {
  if (position !== 'push2') return position;
  return slots.hpush.rung >= PIKE_FROM_RUNG ? 'vpush' : 'hpush';
}

/**
 * One day of the program.
 * @param {string} level
 * @param {number} week
 * @param {number} day
 * @param {object} [options]
 *   slots      stored slot states (missing ones start from the level)
 *   now        for the comeback rule after time off
 *   lowImpact  no jumping on cardio days
 *   light      a lighter week: one set fewer of everything
 * @returns {{ level, week, day, focus, rest: boolean, restSeconds, light,
 *   items: Array<{ exerciseId, sets, target, hold, slot?, role, warmup?, rest }> }}
 * A rest day has no items. Warm-up items come first and are not progressed.
 */
export function dayPlan(level, week, day, options = {}) {
  const lv = normalizeLevel(level);
  const w = Math.min(PROGRAM_WEEKS, Math.max(1, Math.floor(week) || 1));
  const d = Math.min(DAYS_PER_WEEK, Math.max(1, Math.floor(day) || 1));
  const focus = focusOf(w, d);
  const shape = LEVEL_SHAPE[lv];
  const light = !!options.light;
  const base = { level: lv, week: w, day: d, focus, rest: focus === 'rest', restSeconds: shape.rest.aux, light };
  if (focus === 'rest') return { ...base, items: [] };

  if (focus === 'cardio') {
    const table = (options.lowImpact ? LOW_IMPACT_CARDIO : CARDIO_TABLE)[lv];
    const sets = Math.max(1, shape.sets - (light ? 1 : 0));
    const items = table.map(([exerciseId, target]) => {
      const hold = isHoldId(exerciseId);
      return { exerciseId, sets, target: grow(target, w, hold), hold, role: 'cardio', rest: CARDIO_REST };
    });
    return { ...base, restSeconds: CARDIO_REST, items };
  }

  const slots = slotsFor(lv, options.slots);
  const strength = DAY_SLOTS[focus].map((position) => {
    const slot = resolveSlot(position, slots);
    const def = SLOTS[slot];
    const exerciseId = slotExercise(slot, slots[slot]);
    const role = def.role;
    const sets = Math.max(1, (role === 'main' ? shape.mainSets : shape.sets) - (light ? 1 : 0));
    return {
      exerciseId,
      sets,
      target: targetToday(slot, slots[slot], options.now),
      hold: isHoldId(exerciseId),
      slot,
      role,
      rest: shape.rest[role],
    };
  });

  // Warm-up: raise (marching jacks, or squats without the jump), mobilise
  // (arm circles, hip hinge), then one easy set of the day's first exercise.
  const lead = strength[0];
  const raise = options.lowImpact ? ['squat', 10] : ['jumpingjack', lv === 'beginner' ? 15 : 20];
  const warmup = [
    raise,
    ['armcircles', 20],
    ['goodmorning', 8],
    [lead.exerciseId, lead.hold ? Math.max(10, round5(lead.target / 2)) : Math.max(3, Math.round(lead.target / 2))],
  ].map(([exerciseId, target]) => ({
    exerciseId,
    sets: 1,
    target,
    hold: isHoldId(exerciseId),
    role: 'warmup',
    warmup: true,
    rest: WARMUP_REST,
  }));

  return { ...base, restSeconds: shape.rest.main, items: [...warmup, ...strength] };
}

/** The seven days of one week. */
export function weekPlan(level, week, options) {
  return Array.from({ length: DAYS_PER_WEEK }, (_, i) => dayPlan(level, week, i + 1, options));
}

/**
 * A day as the workout screen runs it: every set in order, each naming its
 * exercise, its target and the rest after it. The last set of a strength rep
 * exercise is "as many as you can" (`max`): its count sets the next target.
 */
export function planSets(plan) {
  const sets = [];
  for (const item of plan.items) {
    for (let i = 0; i < item.sets; i += 1) {
      const amrap = !!item.slot && !item.hold && i === item.sets - 1;
      sets.push({
        exerciseId: item.exerciseId,
        target: item.target,
        hold: item.hold,
        max: amrap,
        slot: item.slot ?? null,
        role: item.role,
        warmup: !!item.warmup,
        rest: item.rest ?? plan.restSeconds,
      });
    }
  }
  return sets;
}

/**
 * Next slot states from a finished day: each slot's sets, in order, through
 * progressSlot. Slots with no set done are left alone.
 * @param {object} slots       states before the day
 * @param {Array} planned      planSets() of the day
 * @param {number[]} counted   reps (seconds for holds) of each set done, by index
 * @returns {{ slots, changes: Array<{ slot, change, from, to }> }}
 *   from / to: { exerciseId, target }
 */
export function applyDayResults(level, slots, planned, counted, at) {
  const current = slotsFor(level, slots);
  const bySlot = {};
  planned.forEach((set, i) => {
    if (!set.slot || set.warmup || !Number.isFinite(counted[i])) return;
    (bySlot[set.slot] = bySlot[set.slot] || []).push(counted[i]);
  });
  const changes = [];
  for (const [slot, results] of Object.entries(bySlot)) {
    const before = current[slot];
    const { state, change } = progressSlot(slot, before, results, at);
    current[slot] = state;
    changes.push({
      slot,
      change,
      from: { exerciseId: slotExercise(slot, before), target: before.target },
      to: { exerciseId: slotExercise(slot, state), target: state.target },
    });
  }
  return { slots: current, changes };
}

/** Totals for a day: sets, reps asked for, and seconds of holds (warm-up left out). */
export function planTotals(plan) {
  let sets = 0;
  let reps = 0;
  let seconds = 0;
  let exercises = 0;
  for (const item of plan.items) {
    if (item.warmup) continue;
    exercises += 1;
    sets += item.sets;
    if (item.hold) seconds += item.sets * item.target;
    else reps += item.sets * item.target;
  }
  return { sets, reps, seconds, exercises };
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
 * is restarted or followed by the next cycle (src/storage/sessions.js,
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

/** Every exercise the program can use, in first-use order. */
export function programExerciseIds() {
  const ids = [];
  const add = (id) => {
    if (!ids.includes(id)) ids.push(id);
  };
  for (const def of Object.values(SLOTS)) def.ladder.forEach(add);
  for (const table of [CARDIO_TABLE, LOW_IMPACT_CARDIO]) {
    for (const level of PROGRAM_LEVELS) table[level].forEach(([id]) => add(id));
  }
  ['jumpingjack', 'armcircles', 'goodmorning', ...TEST_ITEMS].forEach(add);
  return ids;
}
