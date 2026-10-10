/**
 * Assertions for the training schedule, the exercise library, achievements,
 * the extended stats and storage shape, and the two translation tables.
 *
 *   npm run verify
 *
 * Plain Node, same loader as the other suites: the app modules are read as
 * text with their Metro-style imports rewritten, so what runs is the real
 * implementation.
 */
import assert from 'node:assert/strict';
import {
  read,
  bundle,
  asModule,
  stripImport,
  createHarness,
  MEMORY_ASYNC_STORAGE,
} from './load.mjs';

// --- load app modules ------------------------------------------------------
const timeSrc = read('src/utils/time.js');
const programSrc = read('src/program/program.js');
const exercisesSrc = read('src/exercises/exercises.js');

const program = await bundle(programSrc);
const exercises = await bundle(exercisesSrc);
const statsSrc = stripImport(read('src/utils/stats.js'), './time');
const achievements = await bundle(
  timeSrc,
  programSrc,
  exercisesSrc,
  statsSrc,
  ['../utils/time', '../program/program', '../exercises/exercises', '../utils/stats'].reduce(
    stripImport,
    read('src/achievements/achievements.js'),
  ),
);
const stats = await bundle(timeSrc, statsSrc);
const weekly = await bundle(
  timeSrc,
  exercisesSrc,
  stripImport(stripImport(read('src/utils/weekly.js'), '../exercises/exercises'), './time'),
);
const strings = await bundle(
  read('src/i18n/exerciseStrings.js'),
  read('src/i18n/featureStrings.js'),
  read('src/i18n/guideStrings.js'),
  stripImport(stripImport(stripImport(read('src/i18n/strings.js'), './exerciseStrings'), './featureStrings'), './guideStrings'),
);
const blocker = await bundle(read('src/blocker/blockerLogic.js'));
const store = await asModule(
  read('src/storage/sessions.js').replace(
    "import AsyncStorage from '@react-native-async-storage/async-storage';",
    MEMORY_ASYNC_STORAGE,
  ),
);

const {
  PROGRAM_LEVELS,
  PROGRAM_WEEKS,
  PROGRAM_HOLD_IDS,
  WEEK_FOCUS,
  TRAINING_DAYS,
  TRAINING_DAYS_TOTAL,
  dayPlan,
  weekPlan,
  planSets,
  planTotals,
  programDayKey,
  nextProgramDay,
  isProgramComplete,
  currentWeek,
  weekProgress,
  weeksCompleted,
  countCompleted,
  programExerciseIds,
  SLOTS,
  progressSlot,
  applyDayResults,
  slotExercise,
  slotsFor,
  startingSlots,
  normalizeSlot,
  slotsFromTest,
  testPlan,
  targetToday,
  needsRetest,
} = program;
const {
  DEFAULT_EXERCISE_ID,
  EXERCISES,
  EXERCISE_IDS,
  getExercise,
  exerciseOf,
  filterByExercise,
  supportsSource,
  BODY_PARTS,
  CLASSIC_EXERCISE_IDS,
  exercisesFor,
  isHold,
  isHoldSession,
} = exercises;
const { ACHIEVEMENTS, unlockedAchievements, newlyUnlocked, longestStreak, bestSetReps } =
  achievements;
const { computeStats, dailyTotals } = stats;
const { STRINGS, LANGUAGES, resolveLanguage, translate } = strings;
const {
  RATE_OPTIONS,
  DEFAULT_RATE_SECONDS,
  EMPTY_STATE,
  normalizeState,
  isSetUp,
  earnsTime,
  isBlocking,
  wasSwitchedOff,
  watcherReady,
  wantsWatcher,
  blockingMode,
  hasWayToBlock,
  looksStalled,
  statusKey,
  alertKind,
  creditFor,
  formatAmount,
  formatPerRep,
  filterApps,
  normalizeApps,
  sortApps,
  normalizeDomain,
  effectiveSites,
  APP_DOMAINS,
  SUGGESTED_PACKAGES,
} = blocker;

const { state, group, check } = createHarness();

const at = (daysAgo, hour = 12) => {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.getTime();
};
const session = (daysAgo, totalReps, extra = {}) => ({
  id: `s${daysAgo}-${totalReps}`,
  timestamp: at(daysAgo),
  totalReps,
  durationSeconds: 60,
  ...extra,
});

// --- training schedule ----------------------------------------------------------
group('training schedule');

/** Every training day of every week, done. */
const allDone = () => {
  const done = {};
  for (let w = 1; w <= PROGRAM_WEEKS; w += 1) for (const d of TRAINING_DAYS) done[programDayKey(w, d)] = 1;
  return done;
};
const strengthItems = (plan) => plan.items.filter((i) => !i.warmup);

await check('a week is three full-body days, two cardio days and two rest days', () => {
  assert.equal(WEEK_FOCUS.length, 7);
  assert.equal(WEEK_FOCUS.filter((f) => f === 'rest').length, 2);
  assert.equal(WEEK_FOCUS.filter((f) => f === 'cardio').length, 2);
  assert.deepEqual(TRAINING_DAYS, [1, 2, 3, 5, 6]);
  assert.equal(TRAINING_DAYS_TOTAL, 5 * PROGRAM_WEEKS);
  assert.deepEqual(weekPlan('beginner', 1).map((p) => p.focus), WEEK_FOCUS);
  // Even weeks swap A and B, so each leads twice in a fortnight.
  assert.deepEqual(weekPlan('beginner', 2).map((p) => p.focus).filter((f) => f.startsWith('full')), ['fullB', 'fullA', 'fullB']);
});

await check('every muscle group is trained on two days or more, every week, at every level', () => {
  for (const level of PROGRAM_LEVELS) {
    for (let week = 1; week <= PROGRAM_WEEKS; week += 1) {
      for (const lowImpact of [false, true]) {
        const days = {};
        for (const plan of weekPlan(level, week, { lowImpact })) {
          assert.equal(plan.rest, plan.items.length === 0, `${level} day ${plan.day}`);
          for (const item of strengthItems(plan)) {
            for (const p of getExercise(item.exerciseId).parts) (days[p] = days[p] || new Set()).add(plan.day);
          }
        }
        for (const part of BODY_PARTS) {
          assert.ok((days[part]?.size ?? 0) >= 2, `${level} w${week}${lowImpact ? ' low impact' : ''}: ${part} on ${days[part]?.size ?? 0} days`);
        }
      }
    }
  }
});

await check('every exercise in the schedule is one the app counts, holds marked as holds', () => {
  for (const id of programExerciseIds()) {
    assert.ok(EXERCISE_IDS.includes(id), `${id} is not in the library`);
    assert.ok(getExercise(id).sources.includes('ai'), `${id} has no camera counter`);
  }
  assert.deepEqual(
    [...PROGRAM_HOLD_IDS].sort(),
    EXERCISES.filter((e) => e.kind === 'hold').map((e) => e.id).sort(),
  );
  for (const level of PROGRAM_LEVELS) {
    for (const plan of weekPlan(level, 1)) {
      for (const item of plan.items) assert.equal(item.hold, isHold(item.exerciseId), item.exerciseId);
    }
  }
  // The slots' ladders need nothing but the floor: no dips off a chair, no unloaded curls.
  for (const def of Object.values(SLOTS)) {
    for (const id of def.ladder) assert.ok(!['dip', 'bicepcurl', 'lateralraise', 'frontraise', 'shoulderpress'].includes(id), id);
  }
});

await check('a strength day: warm-up first, the main move next, holds last', () => {
  for (const level of PROGRAM_LEVELS) {
    for (const plan of weekPlan(level, 1).filter((p) => p.focus.startsWith('full'))) {
      const firstStrength = plan.items.findIndex((i) => !i.warmup);
      assert.ok(firstStrength >= 3, 'a warm-up of a few moves');
      assert.ok(plan.items.slice(0, firstStrength).every((i) => i.warmup && i.sets === 1));
      // The last warm-up move is an easy set of the first exercise.
      assert.equal(plan.items[firstStrength - 1].exerciseId, plan.items[firstStrength].exerciseId);
      assert.ok(plan.items[firstStrength - 1].target < plan.items[firstStrength].target);
      assert.equal(plan.items[firstStrength].role, 'main');
      const roles = strengthItems(plan).map((i) => i.role);
      const firstHold = roles.indexOf('hold');
      if (firstHold >= 0) assert.ok(roles.slice(firstHold).every((r) => r === 'hold' || r === 'aux'), roles.join());
      const lastNonHold = roles.length - 1 - [...roles].reverse().findIndex((r) => r !== 'hold');
      assert.ok(firstHold < 0 || firstHold > roles.indexOf('main'), roles.join());
      assert.ok(lastNonHold >= 0);
      // Rest follows effort: longest after the main move, shortest after the warm-up.
      const main = strengthItems(plan).find((i) => i.role === 'main');
      const hold = strengthItems(plan).find((i) => i.role === 'hold');
      if (hold) assert.ok(main.rest > hold.rest);
      assert.ok(plan.items[0].rest < hold?.rest ?? main.rest);
    }
  }
});

await check('levels differ: more sets and longer rest after the main moves as the level rises', () => {
  const sets = (level) => weekPlan(level, 1).reduce((sum, p) => sum + planTotals(p).sets, 0);
  assert.ok(sets('beginner') < sets('intermediate'));
  assert.ok(sets('intermediate') < sets('advanced'));
  const main = (level) => strengthItems(dayPlan(level, 1, 1))[0];
  assert.equal(main('beginner').sets, 2);
  assert.equal(main('intermediate').sets, 3);
  assert.equal(main('advanced').sets, 4);
  assert.ok(main('beginner').rest <= main('advanced').rest);
  // The level's starting point: an easier push-up for a beginner.
  assert.equal(main('beginner').exerciseId, 'inclinepushup');
  assert.equal(main('intermediate').exerciseId, 'pushup');
});

await check('a lighter week has one set fewer; cardio grows week over week', () => {
  const normal = dayPlan('intermediate', 1, 1);
  const light = dayPlan('intermediate', 1, 1, { light: true });
  strengthItems(light).forEach((item, i) => assert.equal(item.sets, Math.max(1, strengthItems(normal)[i].sets - 1)));
  assert.equal(light.light, true);
  const cardio = (w) => planTotals(dayPlan('beginner', w, 2)).reps;
  assert.ok(cardio(4) > cardio(1) * 1.2);
  // Jump-free cardio leaves out every jump.
  const jumps = ['jumpingjack', 'burpee', 'highknees', 'buttkicks'];
  for (const level of PROGRAM_LEVELS) {
    for (const plan of weekPlan(level, 1, { lowImpact: true })) {
      for (const item of plan.items) assert.ok(!jumps.includes(item.exerciseId), `${level} ${item.exerciseId}`);
    }
  }
});

await check('a day runs as every set in order; the last set of a rep exercise is as many as you can', () => {
  const plan = dayPlan('intermediate', 2, 1);
  const sets = planSets(plan);
  assert.equal(sets.length, plan.items.reduce((n, i) => n + i.sets, 0));
  assert.deepEqual(
    sets.map((s) => s.exerciseId),
    plan.items.flatMap((i) => Array(i.sets).fill(i.exerciseId)),
  );
  assert.ok(sets.every((s) => s.target > 0 && s.rest > 0));
  for (const item of plan.items) {
    const own = sets.filter((s) => s.exerciseId === item.exerciseId && s.warmup === !!item.warmup && s.slot === (item.slot ?? null));
    const amraps = own.filter((s) => s.max);
    if (item.warmup || item.hold || !item.slot) assert.equal(amraps.length, 0, item.exerciseId);
    else {
      assert.equal(amraps.length, 1, item.exerciseId);
      assert.equal(own[own.length - 1].max, true);
    }
  }
});

await check('progression: beat the target with reps to spare and it rises', () => {
  const s = (target, rung = 2, extra = {}) => ({ rung, target, top: 0, misses: 0, lastAt: null, ...extra });
  let r = progressSlot('hpush', s(8), [8, 8, 11]);
  assert.equal(r.change, 'up');
  assert.equal(r.state.target, 9);
  r = progressSlot('hpush', s(8), [8, 8, 14]);
  assert.equal(r.state.target, 10, '6+ to spare: two reps');
  r = progressSlot('hpush', s(8), [8, 8, 9]);
  assert.equal(r.change, 'same', 'made it, nothing to spare');
  assert.equal(r.state.target, 8);
  // Holds add five seconds once every set held.
  r = progressSlot('coreHold', s(30, 0), [30, 30]);
  assert.equal(r.state.target, 35);
});

await check('progression: two sessions at the top of the range bring the next, harder variation', () => {
  let state = { rung: 2, target: 12, top: 0, misses: 0 };
  let r = progressSlot('hpush', state, [12, 12, 16]);
  assert.equal(r.change, 'same');
  assert.equal(r.state.top, 1);
  r = progressSlot('hpush', r.state, [12, 12, 15]);
  assert.equal(r.change, 'rung');
  assert.equal(r.state.rung, 3);
  assert.equal(r.state.target, SLOTS.hpush.range[0]);
  assert.equal(slotExercise('hpush', r.state), 'diamondpushup');
  // On the last rung there is nowhere harder to go: the target keeps rising, up to a ceiling.
  state = { rung: SLOTS.hpush.ladder.length - 1, target: 12, top: 0, misses: 0 };
  r = progressSlot('hpush', state, [12, 12, 16]);
  assert.equal(r.change, 'up');
  assert.equal(r.state.target, 13);
});

await check('progression: fall short and the target waits; twice running, it eases or steps down', () => {
  let r = progressSlot('squat', { rung: 1, target: 15, top: 0, misses: 0 }, [15, 12]);
  assert.equal(r.change, 'same');
  assert.equal(r.state.misses, 1);
  r = progressSlot('squat', r.state, [14, 11]);
  assert.equal(r.change, 'down');
  assert.ok(r.state.target < 15 && r.state.target >= SLOTS.squat.range[0]);
  r = progressSlot('squat', { rung: 1, target: 10, top: 0, misses: 1 }, [7, 6]);
  assert.equal(r.change, 'rungDown');
  assert.equal(r.state.rung, 0);
  // Never below an easiest rung's floor of a few reps.
  r = progressSlot('hpush', { rung: 0, target: 6, top: 0, misses: 1 }, [2, 1]);
  assert.ok(r.state.target >= 3 && r.state.rung === 0);
  assert.equal(progressSlot('hpush', { rung: 2, target: 8 }, []).change, 'same', 'no sets, no change');
});

await check('a finished day moves each slot by its own sets; warm-ups do not count', () => {
  const plan = dayPlan('intermediate', 1, 1);
  const planned = planSets(plan);
  const counted = planned.map((s) => (s.max ? s.target + 4 : s.target));
  const { slots, changes } = applyDayResults('intermediate', null, planned, counted, 1000);
  const hpush = changes.find((c) => c.slot === 'hpush');
  assert.equal(hpush.change, 'up');
  assert.equal(slots.hpush.target, hpush.from.target + 1);
  assert.equal(slots.hpush.lastAt, 1000);
  assert.ok(!changes.some((c) => c.slot === undefined));
  // A day cut short moves only what was done.
  const partial = applyDayResults('intermediate', null, planned, counted.slice(0, 5), 1000);
  assert.ok(partial.changes.every((c) => planned.slice(0, 5).some((s) => s.slot === c.slot)));
});

await check('after time off the target eases; after two weeks a retest is due', () => {
  const day = 24 * 60 * 60 * 1000;
  const t0 = Date.UTC(2026, 0, 1);
  const state = { rung: 2, target: 10, lastAt: t0 };
  assert.equal(targetToday('hpush', state, t0 + 3 * day), 10);
  assert.equal(targetToday('hpush', state, t0 + 10 * day), 9);
  assert.equal(targetToday('hpush', state, t0 + 20 * day), 8);
  assert.equal(needsRetest({ hpush: state }, t0 + 10 * day), false);
  assert.equal(needsRetest({ hpush: state }, t0 + 15 * day), true);
  assert.equal(needsRetest(null, 15 * day), false);
});

await check('the placement test sets the level and where each exercise starts', () => {
  assert.equal(slotExercise('hpush', slotsFromTest({ pushup: 0 }).slots.hpush), 'inclinepushup');
  assert.equal(slotExercise('hpush', slotsFromTest({ pushup: 3 }).slots.hpush), 'kneepushup');
  let placed = slotsFromTest({ pushup: 12, squat: 20, glutebridge: 15, plank: 50 });
  assert.equal(placed.level, 'intermediate');
  assert.equal(slotExercise('hpush', placed.slots.hpush), 'pushup');
  assert.equal(placed.slots.hpush.target, 7);
  assert.equal(placed.slots.squat.target, 12);
  assert.equal(placed.slots.coreHold.target, 25);
  // 60% of a big max is past the range: start a rung up.
  placed = slotsFromTest({ pushup: 30, squat: 50 });
  assert.equal(placed.level, 'advanced');
  assert.equal(slotExercise('hpush', placed.slots.hpush), 'diamondpushup');
  assert.equal(slotExercise('squat', placed.slots.squat), 'splitsquat');
  assert.equal(slotsFromTest({ pushup: 4 }).level, 'beginner');
  // The test itself: one maximal set of each; a yes on the health check drops the plank.
  assert.ok(testPlan().sets.every((s) => s.max));
  assert.ok(!testPlan({ cautious: true }).sets.some((s) => s.exerciseId === 'plank'));
});

await check('stored slots are cleaned up; a missing one starts from the level', () => {
  const slots = slotsFor('beginner', { hpush: { rung: 99, target: -5 }, squat: 'junk' });
  assert.equal(slots.hpush.rung, SLOTS.hpush.ladder.length - 1);
  assert.ok(slots.hpush.target >= 3);
  assert.deepEqual(slots.squat, startingSlots('beginner').squat);
  assert.equal(normalizeSlot('coreHold', { target: 33 }).target % 5, 0);
});

await check('weeks and days are clamped; unknown levels are beginner', () => {
  assert.equal(dayPlan('beginner', 0, 0).week, 1);
  assert.equal(dayPlan('beginner', 99, 99).week, PROGRAM_WEEKS);
  assert.equal(dayPlan('beginner', 1, 99).day, 7);
  assert.equal(dayPlan('nonsense', 1, 1).level, 'beginner');
  assert.equal(dayPlan(undefined, 1, 4).rest, true);
});

await check('the next day is the first not done; progress per week and overall', () => {
  assert.deepEqual(nextProgramDay({}), { week: 1, day: 1 });
  assert.deepEqual(nextProgramDay({ '1-1': 1, '1-2': 1 }), { week: 1, day: 3 });
  assert.deepEqual(nextProgramDay({ '1-1': 1, '1-3': 1 }), { week: 1, day: 2 }, 'a skipped day comes back around');
  const week1 = Object.fromEntries(TRAINING_DAYS.map((d) => [programDayKey(1, d), 1]));
  assert.deepEqual(nextProgramDay(week1), { week: 2, day: 1 }, 'rest days are never next');
  assert.equal(currentWeek(week1), 2);
  assert.deepEqual(weekProgress(week1, 1), { done: 5, total: 5 });
  assert.deepEqual(weekProgress(week1, 2), { done: 0, total: 5 });
  assert.equal(weeksCompleted(week1), 1);
  assert.equal(countCompleted({ ...week1, '1-4': 1, junk: 1 }), 5, 'rest days and junk are not counted');
  assert.equal(nextProgramDay(allDone()), null);
  assert.equal(isProgramComplete(allDone()), true);
  assert.equal(isProgramComplete(week1), false);
  assert.equal(currentWeek(allDone()), PROGRAM_WEEKS);
});

// --- exercises ---------------------------------------------------------------
group('exercises');

// The ids in src/sensors/sources.js, which imports native modules and so
// cannot load here.
const SOURCE_IDS = ['ai', 'light', 'motion', 'tap', 'timer'];

await check('the registry is well-formed', () => {
  assert.ok(EXERCISE_IDS.length >= 35, `${EXERCISE_IDS.length} exercises`);
  assert.deepEqual(EXERCISE_IDS.slice(0, 4), CLASSIC_EXERCISE_IDS, 'the classics keep their place');
  assert.equal(new Set(EXERCISE_IDS).size, EXERCISE_IDS.length, 'ids are unique');
  assert.deepEqual(EXERCISE_IDS, EXERCISES.map((e) => e.id));
  for (const e of EXERCISES) {
    assert.match(e.id, /^[a-z]+$/, `${e.id}: ids are translation keys and stored on sessions`);
    assert.ok(typeof e.icon === 'string' && e.icon.length > 0, `${e.id} icon`);
    assert.ok(e.sources.length > 0, `${e.id} has no source`);
    assert.equal(new Set(e.sources).size, e.sources.length, `${e.id} lists a source twice`);
    for (const id of e.sources) assert.ok(SOURCE_IDS.includes(id), `${e.id}: unknown source ${id}`);
    assert.ok(['reps', 'hold'].includes(e.kind), `${e.id} kind`);
    assert.ok(e.sources.includes('ai'), `${e.id}: every exercise has a camera counter`);
    // A fallback every platform has: tapping for reps, the stopwatch for holds.
    assert.ok(e.sources.includes(e.kind === 'hold' ? 'timer' : 'tap'), `${e.id}: no fallback source`);
    assert.ok(!(e.kind === 'hold' && e.sources.includes('tap')), `${e.id}: a hold cannot be tapped`);
    assert.ok(e.parts.length > 0 && e.parts.every((p) => BODY_PARTS.includes(p)), `${e.id} parts`);
    assert.ok(['side', 'front'].includes(e.view), `${e.id} view`);
    // Relative to a push-up: a harder variant (the archer push-up) may earn a
    // little more, never a windfall.
    assert.ok(e.creditWeight > 0 && e.creditWeight <= 1.5, `${e.id} creditWeight ${e.creditWeight}`);
    assert.ok(Number.isFinite(e.minRepMs) && e.minRepMs > 0, `${e.id} minRepMs`);
    if (e.sources.includes('motion')) {
      const { nearDeg, farDeg } = e.motion ?? {};
      assert.ok(nearDeg > farDeg && farDeg > 0, `${e.id}: near ${nearDeg} must exceed far ${farDeg} > 0`);
      assert.ok(nearDeg < 180, `${e.id}: the phone cannot turn more than 180 degrees away`);
    } else {
      assert.equal(e.motion, null, `${e.id} has motion thresholds but no motion source`);
    }
  }
});

await check('push-ups come first and are the default', () => {
  assert.equal(DEFAULT_EXERCISE_ID, 'pushup');
  assert.equal(EXERCISES[0].id, DEFAULT_EXERCISE_ID);
  assert.equal(EXERCISES[0].creditWeight, 1, 'credit is relative to a push-up');
});

await check('every body part has exercises, and the filter finds them', () => {
  assert.equal(exercisesFor('all'), EXERCISES);
  assert.equal(exercisesFor(null), EXERCISES);
  for (const part of BODY_PARTS) {
    const list = exercisesFor(part);
    assert.ok(list.length >= 3, `${part}: ${list.length}`);
    assert.ok(list.every((e) => e.parts.includes(part)));
  }
  assert.ok(exercisesFor('core').some((e) => e.kind === 'hold'), 'planks are core');
});

await check('holds are known by id and on stored sessions', () => {
  assert.equal(isHold('plank'), true);
  assert.equal(isHold('pushup'), false);
  assert.equal(isHold(undefined), false, 'a legacy record is a push-up');
  assert.equal(isHoldSession(session(0, 60, { exerciseId: 'wallsit' })), true);
  assert.equal(isHoldSession(session(0, 60)), false);
});

await check('a missing or unknown exercise is a push-up', () => {
  assert.equal(getExercise('squat').id, 'squat');
  assert.equal(getExercise(undefined).id, 'pushup');
  assert.equal(getExercise(null).id, 'pushup');
  assert.equal(getExercise('burpee').id, 'burpee');
  assert.equal(getExercise('nonsense').id, 'pushup');
  assert.equal(exerciseOf(session(0, 5)), 'pushup', 'a record from before exercises');
  assert.equal(exerciseOf(session(0, 5, { exerciseId: 'situp' })), 'situp');
  assert.equal(exerciseOf(session(0, 5, { exerciseId: 42 })), 'pushup');
  assert.equal(exerciseOf(null), 'pushup');
});

await check('filterByExercise files legacy records under push-ups', () => {
  const list = [
    session(0, 10),
    session(1, 20, { exerciseId: 'squat' }),
    session(2, 30, { exerciseId: 'pushup' }),
  ];
  assert.equal(filterByExercise(list, 'all'), list);
  assert.equal(filterByExercise(list, null), list);
  assert.equal(filterByExercise(list, undefined), list);
  assert.deepEqual(filterByExercise(list, 'pushup').map((s) => s.totalReps), [10, 30]);
  assert.deepEqual(filterByExercise(list, 'squat').map((s) => s.totalReps), [20]);
  assert.deepEqual(filterByExercise(list, 'jumpingjack'), []);
});

await check("supportsSource follows each exercise's list", () => {
  assert.equal(supportsSource('pushup', 'light'), true);
  assert.equal(supportsSource('pushup', 'motion'), false);
  assert.equal(supportsSource('squat', 'motion'), true);
  assert.equal(supportsSource('squat', 'light'), false, 'covering the earpiece says nothing about a squat');
  assert.equal(supportsSource('jumpingjack', 'ai'), true);
  assert.equal(supportsSource('squat', 'nope'), false);
  assert.equal(supportsSource('nonsense', 'light'), true, 'an unknown exercise is a push-up');
  assert.equal(supportsSource('plank', 'timer'), true);
  assert.equal(supportsSource('plank', 'tap'), false);
});

// --- achievements ----------------------------------------------------------
group('achievements');

await check('nothing is earned by an empty history', () => {
  assert.deepEqual(unlockedAchievements([]), []);
});

await check('the first workout earns exactly one badge', () => {
  assert.deepEqual(unlockedAchievements([session(0, 10)]), ['first_workout']);
});

await check('total-rep badges accumulate across sessions', () => {
  const list = unlockedAchievements([session(0, 60), session(1, 45)]);
  assert.ok(list.includes('reps_100'));
  assert.ok(!list.includes('reps_500'));
});

await check('best set reads sets when present and totalReps for old records', () => {
  assert.equal(bestSetReps([session(0, 40)]), 40);
  assert.equal(
    bestSetReps([session(0, 40, { sets: [{ reps: 15 }, { reps: 25 }] })]),
    25,
    'a 40-rep workout in two sets is not a 40-rep set',
  );
  assert.ok(unlockedAchievements([session(0, 30)]).includes('set_25'));
  assert.ok(
    !unlockedAchievements([session(0, 30, { sets: [{ reps: 15 }, { reps: 15 }] })]).includes(
      'set_25',
    ),
  );
});

await check('longestStreak finds the longest run, not the current one', () => {
  const runs = [session(0, 5), session(4, 5), session(5, 5), session(6, 5), session(9, 0)];
  assert.equal(longestStreak(runs), 3);
  assert.equal(longestStreak([]), 0);
  assert.equal(longestStreak([session(2, 0)]), 0, 'zero-rep sessions do not count');
});

await check('streak badges use the historical best', () => {
  const list = unlockedAchievements([session(3, 5), session(4, 5), session(5, 5)]);
  assert.ok(list.includes('streak_3'));
  assert.ok(!list.includes('streak_7'));
});

await check('early bird and night owl read the local hour', () => {
  const early = { ...session(0, 5), timestamp: at(0, 6) };
  const late = { ...session(1, 5), timestamp: at(1, 22) };
  const list = unlockedAchievements([early, late]);
  assert.ok(list.includes('early_bird'));
  assert.ok(list.includes('night_owl'));
  assert.ok(!unlockedAchievements([session(0, 5)]).includes('early_bird'));
});

await check('program badges come from the old program or the schedule', () => {
  assert.ok(unlockedAchievements([session(0, 5)], { 1: 1 }).includes('program_day'), 'old program');
  const old = {};
  for (let d = 1; d <= 18; d += 1) old[d] = 1;
  assert.ok(unlockedAchievements([session(0, 5)], old).includes('program_done'), 'the old 18 days still count');
  assert.ok(!unlockedAchievements([session(0, 5)], { 1: 1 }).includes('program_done'));
  assert.ok(unlockedAchievements([session(0, 5)], {}, { '1-1': 1 }).includes('program_day'), 'schedule');
  assert.ok(!unlockedAchievements([session(0, 5)], {}, { '1-1': 1 }).includes('program_week'));
  const week1 = Object.fromEntries(TRAINING_DAYS.map((d) => [programDayKey(1, d), 1]));
  assert.ok(unlockedAchievements([session(0, 5)], {}, week1).includes('program_week'));
  assert.ok(!unlockedAchievements([session(0, 5)], {}, week1).includes('program_done'));
  assert.ok(unlockedAchievements([session(0, 5)], {}, allDone()).includes('program_done'));
});

await check('a run that is restarted or levelled up from keeps its program badges', () => {
  const earned = program.addEarnedRun(null, allDone());
  assert.deepEqual(earned, { days: TRAINING_DAYS_TOTAL, weeks: PROGRAM_WEEKS, complete: 1 });
  const list = unlockedAchievements([session(0, 5)], {}, {}, earned);
  for (const id of ['program_day', 'program_week', 'program_done']) assert.ok(list.includes(id), id);
  const partial = program.addEarnedRun(earned, { '1-1': 1 });
  assert.deepEqual(partial, { days: TRAINING_DAYS_TOTAL + 1, weeks: PROGRAM_WEEKS, complete: 1 });
  assert.ok(!unlockedAchievements([session(0, 5)], {}, {}, { days: 1, weeks: 0, complete: 0 }).includes('program_week'));
});

await check('a schedule day of several exercises is one workout, not one per exercise', () => {
  const day = ['squat', 'lunge', 'wallsit', 'glutebridge', 'donkeykick', 'sumosquat'].map((exerciseId, i) =>
    session(0, 10, { id: `d${i}`, exerciseId, workoutId: 'day1' }),
  );
  assert.equal(stats.countWorkouts(day), 1);
  assert.equal(computeStats(day).sessionCount, 1);
  const twoDays = [...day, ...day.map((s) => ({ ...s, id: `${s.id}b`, workoutId: 'day2' }))];
  assert.ok(!unlockedAchievements(twoDays).includes('workouts_10'), '12 sessions are 2 workouts');
  const ten = Array.from({ length: 10 }, (_, i) => session(i, 5, { id: `free${i}` }));
  assert.ok(unlockedAchievements(ten).includes('workouts_10'));
});

await check('library badges: exercises tried, and time held', () => {
  const tried = (n) => EXERCISE_IDS.slice(0, n).map((exerciseId, i) => session(i % 3, 5, { exerciseId }));
  assert.ok(!unlockedAchievements(tried(9)).includes('explorer_10'));
  assert.ok(unlockedAchievements(tried(10)).includes('explorer_10'));
  assert.ok(unlockedAchievements(tried(25)).includes('explorer_25'));
  const planks = [session(0, 200, { exerciseId: 'plank' }), session(1, 99, { exerciseId: 'wallsit' })];
  assert.ok(!unlockedAchievements(planks).includes('hold_300'));
  assert.ok(unlockedAchievements([...planks, session(2, 1, { exerciseId: 'superman' })]).includes('hold_300'));
  assert.ok(!unlockedAchievements(planks).includes('reps_100'), 'seconds held are not push-ups');
});

await check('squats, sit-ups and jumping jacks are not push-ups', () => {
  const list = unlockedAchievements([
    session(0, 120, { exerciseId: 'squat' }),
    session(1, 120, { exerciseId: 'situp' }),
    session(2, 600, { exerciseId: 'jumpingjack' }),
  ]);
  for (const id of ['reps_100', 'reps_500', 'set_25', 'set_50', 'set_100']) {
    assert.ok(!list.includes(id), `${id} came from other exercises`);
  }
  assert.ok(list.includes('first_workout'), 'a workout is a workout');
  assert.ok(list.includes('streak_3'), 'any exercise keeps a streak going');
  const early = { ...session(0, 5, { exerciseId: 'squat' }), timestamp: at(0, 6) };
  assert.ok(unlockedAchievements([early]).includes('early_bird'));
});

await check('push-up badges count legacy and tagged push-up records alike', () => {
  const list = unlockedAchievements([
    session(0, 60),
    session(1, 45, { exerciseId: 'pushup' }),
    session(2, 200, { exerciseId: 'squat' }),
  ]);
  assert.ok(list.includes('reps_100'));
  assert.ok(!list.includes('reps_500'), 'the 200 squats are not added in');
  assert.ok(list.includes('set_50'));
  assert.ok(!list.includes('set_100'), 'a 200-squat set is not a push-up set');
});

await check('each other exercise has its own total badge', () => {
  const of = (exerciseId, ...reps) => reps.map((n, i) => session(i, n, { exerciseId }));
  const has = (sessions, id) => unlockedAchievements(sessions).includes(id);
  assert.ok(!has(of('squat', 60, 39), 'squats_100'));
  assert.ok(has(of('squat', 60, 40), 'squats_100'), 'totals add up across workouts');
  assert.ok(!has(of('situp', 99), 'situps_100'));
  assert.ok(has(of('situp', 100), 'situps_100'));
  assert.ok(!has(of('jumpingjack', 150, 49), 'jacks_200'));
  assert.ok(has(of('jumpingjack', 150, 50), 'jacks_200'));
  const pushups = unlockedAchievements([session(0, 250), session(1, 250)]);
  for (const id of ['squats_100', 'situps_100', 'jacks_200']) assert.ok(!pushups.includes(id), id);
});

await check('all-rounder needs the four classic exercises, each with a rep', () => {
  const three = [
    session(0, 5),
    session(0, 5, { exerciseId: 'squat' }),
    session(1, 5, { exerciseId: 'situp' }),
  ];
  assert.ok(!unlockedAchievements(three).includes('all_rounder'));
  assert.ok(
    !unlockedAchievements([...three, session(1, 0, { exerciseId: 'jumpingjack' })]).includes(
      'all_rounder',
    ),
    'a jumping-jack workout of no reps is not doing one',
  );
  assert.ok(
    unlockedAchievements([...three, session(2, 1, { exerciseId: 'jumpingjack' })]).includes(
      'all_rounder',
    ),
    'the legacy record without exerciseId is the push-up',
  );
});

await check('new badges are appended, so the grid keeps its order', () => {
  const ids = ACHIEVEMENTS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  assert.deepEqual(ids.slice(0, 25), [
    'first_workout',
    'reps_100',
    'reps_500',
    'reps_1000',
    'reps_5000',
    'set_25',
    'set_50',
    'set_100',
    'streak_3',
    'streak_7',
    'streak_30',
    'workouts_10',
    'workouts_50',
    'early_bird',
    'night_owl',
    'program_day',
    'program_done',
    'squats_100',
    'situps_100',
    'jacks_200',
    'all_rounder',
    'explorer_10',
    'explorer_25',
    'hold_300',
    'program_week',
  ]);
  const badge = (id) => ACHIEVEMENTS.find((a) => a.id === id);
  assert.equal(badge('squats_100').exercise, 'squat');
  assert.equal(badge('situps_100').exercise, 'situp');
  assert.equal(badge('jacks_200').exercise, 'jumpingjack');
  for (const a of ACHIEVEMENTS) assert.ok(a.exercise || /^[a-z-]+$/.test(a.icon), `${a.id} has an icon name`);
});

await check('newlyUnlocked is the difference, in definition order', () => {
  assert.deepEqual(newlyUnlocked(['first_workout'], ['first_workout', 'reps_100']), ['reps_100']);
  assert.deepEqual(newlyUnlocked(['a'], ['a']), []);
});

await check('every achievement has both translations', () => {
  for (const a of ACHIEVEMENTS) {
    for (const lang of LANGUAGES) {
      assert.ok(STRINGS[lang][`ach.${a.id}.title`], `${lang} title for ${a.id}`);
      assert.ok(STRINGS[lang][`ach.${a.id}.body`], `${lang} body for ${a.id}`);
    }
  }
});

// --- stats -------------------------------------------------------------------
group('stats (sets and daily totals)');

await check('computeStats tracks best set and best day', () => {
  const s = computeStats([
    session(0, 30, { sets: [{ reps: 20 }, { reps: 10 }] }),
    session(0, 15),
    session(1, 25),
  ]);
  assert.equal(s.bestSet, 25, 'legacy single-set record of 25 beats a 20-rep set');
  assert.equal(s.bestDay, 45);
  assert.equal(s.bestSession, 30);
  assert.equal(s.todayReps, 45);
});

await check('stats count every exercise; filterByExercise narrows them first', () => {
  const list = [
    session(0, 20),
    session(0, 30, { exerciseId: 'squat' }),
    session(1, 40, { exerciseId: 'jumpingjack' }),
  ];
  const all = computeStats(list);
  assert.equal(all.todayReps, 50, 'the daily goal is every rep');
  assert.equal(all.totalReps, 90);
  assert.equal(all.streak, 2);
  const squats = computeStats(filterByExercise(list, 'squat'));
  assert.equal(squats.totalReps, 30);
  assert.equal(squats.sessionCount, 1);
  assert.equal(computeStats(filterByExercise(list, 'pushup')).bestSet, 20);
  assert.equal(dailyTotals(filterByExercise(list, 'jumpingjack'), 7)[5].reps, 40);
});

await check('holds stay out of the rep stats, but keep the streak and count in seconds', () => {
  const opts = { isHold: isHoldSession };
  const list = [session(0, 20), session(0, 90, { exerciseId: 'plank' }), session(1, 60, { exerciseId: 'plank' })];
  const reps = computeStats(list, Date.now(), opts);
  assert.equal(reps.totalReps, 20);
  assert.equal(reps.todayReps, 20, 'the daily goal is reps');
  assert.equal(reps.streak, 2, 'a day of planks is a day trained');
  assert.equal(reps.sessionCount, 3);
  const secs = computeStats(filterByExercise(list, 'plank'), Date.now(), { ...opts, unit: 'seconds' });
  assert.equal(secs.totalReps, 150);
  assert.equal(secs.bestSet, 90);
  assert.equal(dailyTotals(list, 7, Date.now(), opts)[6].reps, 20);
  assert.equal(dailyTotals(list, 7, Date.now(), { ...opts, unit: 'seconds' })[5].reps, 60);
  assert.equal(computeStats(list).totalReps, 170, 'without the option, as before holds existed');
});

await check('dailyTotals is a full week ending today, zeros included', () => {
  const week = dailyTotals([session(0, 10), session(2, 5), session(2, 7), session(9, 99)], 7);
  assert.equal(week.length, 7);
  assert.equal(week[6].offset, 0);
  assert.equal(week[6].reps, 10);
  assert.equal(week[4].reps, 12);
  assert.equal(week[0].reps, 0);
  assert.equal(
    week.reduce((sum, d) => sum + d.reps, 0),
    22,
    'a session outside the window is not counted',
  );
});

// --- strings -----------------------------------------------------------------
group('strings');

await check('en and vi define exactly the same keys', () => {
  // `.one` is English grammar ("1 rep"): Vietnamese nouns have no plural.
  const en = Object.keys(STRINGS.en).filter((k) => !k.endsWith('.one')).sort();
  const vi = Object.keys(STRINGS.vi).sort();
  assert.deepEqual(vi, en);
  for (const k of Object.keys(STRINGS.en).filter((key) => key.endsWith('.one'))) {
    assert.ok(STRINGS.en[k.slice(0, -4)], `${k} has a plural to go with`);
  }
});

await check('a count of one is singular in English and unchanged in Vietnamese', () => {
  assert.equal(translate('en', 'progress.weekTotal', { reps: 1 }), '1 rep in 7 days');
  assert.equal(translate('en', 'progress.weekTotal', { reps: 2 }), '2 reps in 7 days');
  assert.equal(translate('en', 'progress.weekTotal', { reps: 0 }), '0 reps in 7 days');
  assert.equal(translate('en', 'backup.previewSessions', { n: 1 }), '1 workout');
  assert.equal(translate('vi', 'progress.weekTotal', { reps: 1 }), '1 cái trong 7 ngày');
});

await check('no key is defined twice, where the later one would silently win', () => {
  const src = read('src/i18n/strings.js');
  for (const name of ['en', 'vi']) {
    const block = src.slice(src.indexOf(`const ${name} = {`), src.indexOf('\n};', src.indexOf(`const ${name} = {`)));
    const keys = [...block.matchAll(/^ {2}'([^']+)':/gm)].map((m) => m[1]);
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    assert.deepEqual(dupes, [], `${name} in strings.js`);
  }
  // The other tables are spread over the base one: an overlap would hide a string.
  const { EXERCISE_STRINGS, FEATURE_STRINGS, GUIDE_STRINGS } = strings;
  for (const lang of LANGUAGES) {
    const seen = new Map();
    for (const [table, keys] of [
      ['exerciseStrings', Object.keys(EXERCISE_STRINGS[lang])],
      ['featureStrings', Object.keys(FEATURE_STRINGS[lang])],
      ['guideStrings', Object.keys(GUIDE_STRINGS[lang])],
    ]) {
      for (const key of keys) {
        assert.ok(!seen.has(key), `${lang} ${key} in ${seen.get(key)} and ${table}`);
        seen.set(key, table);
      }
    }
  }
});

await check('placeholders match between languages', () => {
  const params = (text) => (text.match(/\{[a-z]+\}/g) || []).sort();
  for (const key of Object.keys(STRINGS.en)) {
    // A singular form has the same placeholders as its plural.
    const other = key.endsWith('.one') ? STRINGS.en[key.slice(0, -4)] : STRINGS.vi[key];
    assert.deepEqual(params(other), params(STRINGS.en[key]), key);
  }
});

await check('every exercise has its name, noun, cue and set-up hints in both languages', () => {
  const others = EXERCISES.filter((e) => e.id !== 'pushup' && e.kind === 'reps').map((e) => e.id);
  for (const lang of LANGUAGES) {
    for (const e of EXERCISES) {
      const noun = STRINGS[lang][`exercise.${e.id}.noun`];
      assert.ok(STRINGS[lang][`exercise.${e.id}`], `${lang} exercise.${e.id}`);
      assert.ok(noun, `${lang} exercise.${e.id}.noun`);
      assert.equal(noun, noun.toLocaleLowerCase(lang), `${lang} exercise.${e.id}.noun is lower-case`);
      assert.ok(STRINGS[lang][`exercise.${e.id}.cue`], `${lang} exercise.${e.id}.cue`);
      for (const part of e.parts) assert.ok(STRINGS[lang][`part.${part}`], `${lang} part.${part}`);
      assert.ok(STRINGS[lang][`view.${e.view}`], `${lang} view.${e.view}`);
      for (const source of e.sources) {
        assert.ok(STRINGS[lang][`exercise.${e.id}.hint.${source}`], `${lang} exercise.${e.id}.hint.${source}`);
      }
    }
    const shared = [
      'source.motion',
      'source.motion.hint',
      'source.timer',
      'source.timer.hint',
      'pose.outdated',
      'coach.notUpright',
      'coach.notLying',
      'coach.notInPosition',
      'coach.bentKnees',
    ];
    for (const key of [...shared, ...others.map((id) => `coach.${id}.shallow`)]) {
      assert.ok(STRINGS[lang][key], `${lang} ${key}`);
    }
  }
});

await check('every schedule focus and level has its words', () => {
  for (const lang of LANGUAGES) {
    for (const focus of new Set(WEEK_FOCUS)) assert.ok(STRINGS[lang][`program.focus.${focus}`], `${lang} ${focus}`);
    for (const level of PROGRAM_LEVELS) {
      assert.ok(STRINGS[lang][`program.level.${level}`], `${lang} ${level}`);
      assert.ok(STRINGS[lang][`program.levelBody.${level}`], `${lang} ${level} body`);
    }
  }
});

// Sit-ups count the chest's tilt, so a phone in a pocket (on the thigh) sees
// nothing; onboarding must name the chest, matching the per-exercise hint.
await check('onboarding names where the phone goes for each motion exercise', () => {
  assert.match(STRINGS.en['onboarding.s1.body'], /chest for sit-ups/);
  assert.match(STRINGS.vi['onboarding.s1.body'], /áp ngực khi gập bụng/);
  assert.doesNotMatch(STRINGS.en['onboarding.s1.body'], /pocket or hand for the others/);
});

await check('translate fills placeholders and never returns undefined', () => {
  assert.equal(translate('en', 'workout.set', { n: 2, total: 5 }), 'Set 2/5');
  assert.equal(translate('vi', 'notice.saved', { reps: 12, time: '01:00' }), 'Đã lưu 12 cái trong 01:00.');
  assert.equal(translate('vi', 'no.such.key'), 'no.such.key');
});

await check('resolveLanguage: explicit setting, then device, then English', () => {
  assert.equal(resolveLanguage('vi', ['en']), 'vi');
  assert.equal(resolveLanguage('auto', ['vi-VN', 'en']), 'vi');
  assert.equal(resolveLanguage('auto', ['fr', 'de']), 'en');
  assert.equal(resolveLanguage('auto', []), 'en');
  assert.equal(resolveLanguage(undefined, ['vi']), 'vi');
});

// --- app blocker -------------------------------------------------------------
group('app blocker');

await check('reps earn time at the chosen rate, never negative', () => {
  assert.equal(creditFor(15, 60), 900);
  assert.equal(creditFor(15, 30), 450);
  assert.equal(creditFor(0, 60), 0);
  assert.equal(creditFor(-5, 60), 0);
  assert.equal(creditFor(NaN, 60), 0);
  assert.equal(creditFor(2.6, 60), 180, 'reps are whole');
  assert.equal(creditFor(10, undefined), 0, 'no rate, no time');
});

await check("an exercise's weight scales what a rep earns, in whole seconds", () => {
  assert.equal(creditFor(7, 60, 0.5), 210, '7 squats at 1 min a push-up');
  assert.equal(creditFor(15, 60, 1), creditFor(15, 60), 'a push-up weighs 1');
  assert.equal(creditFor(15, 60, undefined), 900, 'left out, the weight is a push-up');
  assert.equal(creditFor(3, 30, 0.25), 23, '22.5 s rounds to whole seconds');
  assert.equal(creditFor(2.6, 60, 0.5), 90, 'reps are still whole first');
  assert.equal(creditFor(10, 60, getExercise('jumpingjack').creditWeight), 150);
  for (const bad of [NaN, null, -1, Infinity, '0.5']) {
    assert.equal(creditFor(10, 60, bad), 0, `weight ${String(bad)} earns nothing`);
  }
  for (const e of EXERCISES) {
    for (const rate of RATE_OPTIONS) {
      assert.ok(Number.isInteger(creditFor(13, rate, e.creditWeight)), `${e.id} at ${rate}`);
    }
  }
});

await check('the default rate is one push-up = one minute, and on offer', () => {
  assert.equal(DEFAULT_RATE_SECONDS, 60);
  assert.ok(RATE_OPTIONS.includes(DEFAULT_RATE_SECONDS));
});

await check('earned time reads as an amount in both languages', () => {
  const en = (key, params) => translate('en', key, params);
  const vi = (key, params) => translate('vi', key, params);
  assert.equal(formatAmount(60, en), '1 min');
  assert.equal(formatAmount(900, vi), '15 phút');
  assert.equal(formatAmount(450, vi), '7 phút 30 giây');
  assert.equal(formatAmount(30, en), '30 sec');
  assert.equal(formatAmount(-3, en), '0 sec');
});

await check('what one rep earns is shown exact, not rounded', () => {
  const en = (key, params) => translate('en', key, params);
  const vi = (key, params) => translate('vi', key, params);
  // A jumping jack at the 30-second rate: ten earn 75 s, so one is 7.5, not 8.
  assert.equal(formatPerRep(30 * 0.25, en), '7.5 sec');
  assert.equal(formatPerRep(30 * 0.25, vi), '7,5 giây');
  assert.equal(creditFor(10, 30, 0.25), 75);
  assert.equal(formatPerRep(60 * 0.5, en), '30 sec');
  assert.equal(formatPerRep(300, vi), '5 phút');
  for (const e of EXERCISES) {
    for (const rate of RATE_OPTIONS) {
      const per = rate * e.creditWeight;
      // Exact for every rate and exercise on offer: n reps earn n times it.
      assert.equal(creditFor(10, rate, e.creditWeight), Math.round(per * 10), `${e.id} at ${rate}`);
    }
  }
});

await check('native state is normalised, junk included', () => {
  assert.deepEqual(normalizeState(null), { ...EMPTY_STATE, reachable: false });
  assert.equal(normalizeState({ reachable: false }).reachable, false, 'blocker process did not answer');
  assert.equal(normalizeState({}).reachable, true);
  const s = normalizeState({
    enabled: true,
    blocked: ['a', 3, null, 'b'],
    balanceSeconds: -4,
    serviceEnabled: 'yes',
  });
  assert.deepEqual(s.blocked, ['a', 'b']);
  assert.equal(s.balanceSeconds, 0);
  assert.equal(s.showTimer, true, 'the countdown defaults to on');
  assert.equal(s.serviceEnabled, false, 'only a real true counts');
  assert.equal(s.developerOptions, false, 'absent from older builds: not flagged');
  assert.equal(normalizeState({ developerOptions: true }).developerOptions, true);
  assert.equal(normalizeState({ developerOptions: 1 }).developerOptions, false);
});

await check('reps only earn once apps or sites are chosen', () => {
  const on = { ...EMPTY_STATE, enabled: true, blocked: ['a'] };
  assert.equal(isSetUp({ ...on, blocked: [] }), false);
  assert.equal(isSetUp({ ...on, enabled: false }), false);
  assert.equal(isSetUp(on), true);
  assert.equal(isSetUp({ ...on, blocked: [], sites: ['vnexpress.net'] }), true, 'sites alone count');
  assert.equal(earnsTime({ ...on, enabled: false }), true, 'switched off still banks time');
  assert.equal(earnsTime({ ...EMPTY_STATE, enabled: true }), false, 'nothing chosen banks nothing');
  assert.equal(earnsTime({ ...EMPTY_STATE, sites: ['vnexpress.net'] }), true);
  assert.equal(isBlocking({ ...on, serviceEnabled: true }), false, 'enabled but not bound yet');
  assert.equal(isBlocking({ ...on, serviceEnabled: true, serviceRunning: true }), true);
});

await check('a service the system switched off is told apart from one never switched on', () => {
  const on = { ...EMPTY_STATE, enabled: true, blocked: ['a'] };
  assert.equal(wasSwitchedOff(on), false, 'never connected: just not set up yet');
  assert.equal(wasSwitchedOff({ ...on, serviceConnectedAt: 1000 }), true);
  assert.equal(wasSwitchedOff({ ...on, serviceConnectedAt: 1000, serviceEnabled: true }), false);
  assert.equal(wasSwitchedOff({ ...on, enabled: false, serviceConnectedAt: 1000 }), false);
  const s = normalizeState({ serviceConnectedAt: 5, batteryOptimized: true, sites: ['x.com', 7] });
  assert.equal(s.serviceConnectedAt, 5);
  assert.equal(s.batteryOptimized, true);
  assert.deepEqual(s.sites, ['x.com']);
});

await check('without Accessibility, usage access and the overlay block apps (not sites)', () => {
  const on = { ...EMPTY_STATE, enabled: true, blocked: ['a'] };
  const granted = { ...on, usageAccess: true, overlayAllowed: true };
  assert.equal(watcherReady({ ...on, usageAccess: true }), false, 'both permissions are needed');
  assert.equal(wantsWatcher(granted), true);
  assert.equal(wantsWatcher({ ...granted, blocked: [], sites: ['x.com'] }), false, 'it cannot see sites');
  assert.equal(wantsWatcher({ ...granted, enabled: false }), false);
  assert.equal(blockingMode(granted), null, 'granted, not started yet');
  assert.equal(blockingMode({ ...granted, watcherRunning: true }), 'usage');
  assert.equal(isBlocking({ ...granted, watcherRunning: true }), true);
  const both = { ...granted, watcherRunning: true, serviceEnabled: true, serviceRunning: true };
  assert.equal(blockingMode(both), 'accessibility', 'Accessibility goes first when both run');
  const n = normalizeState({ usageAccess: true, overlayAllowed: 1, watcherRunning: true });
  assert.deepEqual([n.usageAccess, n.overlayAllowed, n.watcherRunning], [true, false, true]);
});

await check('switching Accessibility off for a banking app keeps apps blocked, with no alarm', () => {
  const on = { ...EMPTY_STATE, enabled: true, blocked: ['a'], sites: ['x.com'], serviceConnectedAt: 1000 };
  const usage = { ...on, usageAccess: true, overlayAllowed: true, watcherRunning: true };
  assert.equal(wasSwitchedOff(usage), true, 'Accessibility did go off');
  assert.equal(statusKey(usage, false), 'blocker.statusOnApps');
  assert.equal(alertKind(usage, false), null, 'the watcher took over');
  assert.equal(looksStalled(usage), false);
  // Switched off from the tab, the watcher starts a moment later: no alarm meanwhile.
  const handingOver = { ...usage, watcherRunning: false };
  assert.equal(statusKey(handingOver, false), 'blocker.statusStarting');
  assert.equal(alertKind(handingOver, false), null, 'not "switched off" while it takes over');
  assert.equal(alertKind(handingOver, true), 'watcher', 'it never started');
  // Without the other permissions the same switch-off stops everything.
  assert.equal(statusKey(on, false), 'blocker.statusSwitchedOff');
  assert.equal(alertKind(on, false), 'switchedOff');
  assert.equal(hasWayToBlock(on), false);
});

await check('the status line and warning card pick the most urgent gap', () => {
  const on = { ...EMPTY_STATE, enabled: true, blocked: ['a'] };
  assert.equal(statusKey({ ...on, enabled: false }, false), 'blocker.statusOff');
  assert.equal(statusKey({ ...on, blocked: [] }, false), 'blocker.statusNoApps');
  assert.equal(statusKey(on, false), 'blocker.statusNeedsPermission');
  assert.equal(statusKey({ ...on, blocked: [], sites: ['x.com'] }, false), 'blocker.statusSitesNeedA11y');
  const a11y = { ...on, serviceEnabled: true };
  assert.equal(statusKey(a11y, false), 'blocker.statusStarting', 'just switched on');
  assert.equal(looksStalled(a11y), true);
  assert.equal(statusKey(a11y, true), 'blocker.statusStalled');
  assert.equal(alertKind(a11y, true), 'stalled');
  assert.equal(statusKey({ ...a11y, serviceRunning: true }, false), 'blocker.statusOn');
  const granted = { ...on, usageAccess: true, overlayAllowed: true };
  assert.equal(looksStalled(granted), true, 'granted but not running');
  assert.equal(alertKind(granted, false), null, 'not before the second look');
  assert.equal(alertKind(granted, true), 'watcher');
  assert.equal(alertKind({ ...on, enabled: false, serviceConnectedAt: 5 }, true), null, 'blocking off');
});

await check('typed sites become bare domains, anything else is refused', () => {
  assert.equal(normalizeDomain('https://www.VnExpress.net/thoi-su?x=1'), 'vnexpress.net');
  assert.equal(normalizeDomain('m.youtube.com'), 'm.youtube.com');
  assert.equal(normalizeDomain('  tiktok.com/  '), 'tiktok.com');
  assert.equal(normalizeDomain('user@reddit.com:443'), 'reddit.com');
  assert.equal(normalizeDomain('tuổitrẻ.vn'), 'tuổitrẻ.vn');
  for (const bad of ['', 'youtube', 'you tube.com', '.com', 'bad_domain!.com', null]) {
    assert.equal(normalizeDomain(bad), null, String(bad));
  }
});

await check("blocking an app blocks its website too, merged with the user's sites", () => {
  assert.deepEqual(
    effectiveSites(['com.google.android.youtube', 'com.ss.android.ugc.trill'], ['VnExpress.net', 'nope']),
    ['tiktok.com', 'vnexpress.net', 'youtu.be', 'youtube.com'],
  );
  assert.deepEqual(effectiveSites(['com.zhiliaoapp.musically', 'com.ss.android.ugc.trill'], []), [
    'tiktok.com',
  ]);
  assert.deepEqual(effectiveSites(['some.unknown.app'], []), []);
  for (const pkg of Object.keys(APP_DOMAINS)) {
    assert.ok(SUGGESTED_PACKAGES.includes(pkg), `${pkg} has sites but is not suggested`);
    for (const d of APP_DOMAINS[pkg]) assert.equal(normalizeDomain(d), d, `${pkg}: ${d}`);
  }
});

await check('app search ignores case and Vietnamese accents', () => {
  const apps = normalizeApps([
    { packageName: 'com.garena.game.kgvn', label: 'Liên Quân Mobile' },
    { packageName: 'com.ss.android.ugc.trill', label: 'TikTok' },
    { packageName: 'vn.example.tickets', label: 'Đặt vé' },
  ]);
  const labels = (query) => filterApps(apps, query).map((a) => a.label);
  assert.deepEqual(labels('lien quan'), ['Liên Quân Mobile']);
  assert.deepEqual(labels('TIK'), ['TikTok']);
  assert.deepEqual(labels('dat'), ['Đặt vé']);
  assert.deepEqual(labels('trill'), ['TikTok'], 'package names match too');
  assert.equal(labels('  ').length, 3);
});

await check('suggested apps sort first, the rest by name', () => {
  const apps = normalizeApps([
    { packageName: 'z.notes', label: 'Notes' },
    { packageName: 'com.google.android.youtube', label: 'YouTube' },
    { packageName: 'a.bank', label: 'Bank' },
    { packageName: 'com.ss.android.ugc.trill', label: 'TikTok' },
  ]);
  assert.deepEqual(
    sortApps(apps).map((a) => a.label),
    ['TikTok', 'YouTube', 'Bank', 'Notes'],
  );
});

await check('the installed-app list drops junk and duplicates', () => {
  const apps = normalizeApps([
    { packageName: 'a', label: '  A  ', icon: 'xx' },
    { packageName: 'a', label: 'dup' },
    { label: 'no package' },
    null,
    { packageName: 'b', label: '', icon: '' },
  ]);
  assert.deepEqual(apps, [
    { packageName: 'a', label: 'A', icon: 'xx' },
    { packageName: 'b', label: 'b', icon: null },
  ]);
  assert.deepEqual(normalizeApps('nope'), []);
});

await check('block-screen copy leaves {app} for the phone and fills everything else', () => {
  for (const lang of LANGUAGES) {
    for (const key of ['native.blockTitle', 'native.timeUpTitle', 'native.blockedToast']) {
      assert.ok(STRINGS[lang][key].includes('{app}'), `${lang} ${key}`);
    }
    assert.ok(
      !translate(lang, 'native.blockBody', { rate: '1 min' }).includes('{'),
      `${lang} native.blockBody is complete once the rate is in`,
    );
  }
});

// --- storage -----------------------------------------------------------------
group('storage (sets, program)');

await check('a multi-set workout stores its sets, an empty set dropped', async () => {
  const { session: saved } = await store.saveSession({
    totalReps: 18,
    durationSeconds: 90,
    sets: [
      { reps: 10, durationSeconds: 40 },
      { reps: 0, durationSeconds: 5 },
      { reps: 8, durationSeconds: 45 },
    ],
    restSeconds: 60.4,
    program: { level: 2, day: 3 },
  });
  assert.deepEqual(saved.sets, [
    { reps: 10, durationSeconds: 40 },
    { reps: 8, durationSeconds: 45 },
  ]);
  assert.equal(saved.restSeconds, 60);
  assert.deepEqual(saved.program, { level: 2, day: 3 });
});

await check('a single-set workout is stored in the original shape', async () => {
  const { session: saved } = await store.saveSession({
    totalReps: 12,
    durationSeconds: 50,
    sets: [{ reps: 12, durationSeconds: 50 }],
  });
  assert.equal(saved.sets, undefined);
  assert.equal(saved.restSeconds, undefined);
  assert.equal(saved.program, undefined);
});

await check('program progress round-trips and tolerates junk', async () => {
  assert.equal(await store.loadProgram(), null);
  await store.saveProgram({ level: 3, testReps: 14, startedAt: 1000, completedDays: { 1: 5, x: 9 } });
  const loaded = await store.loadProgram();
  assert.equal(loaded.level, 3);
  assert.equal(loaded.testReps, 14);
  assert.deepEqual(loaded.completedDays, { 1: 5 });
  await store.saveProgram(null);
  assert.equal(await store.loadProgram(), null);
});

await check('schedule progress round-trips and tolerates junk', async () => {
  assert.equal(await store.loadSchedule(), null);
  await store.saveSchedule({ level: 'advanced', startedAt: 5, completed: { '1-1': 9, '2-3': 'x', nope: 4 } });
  const loaded = await store.loadSchedule();
  assert.equal(loaded.level, 'advanced');
  assert.equal(loaded.startedAt, 5);
  assert.deepEqual(loaded.completed, { '1-1': 9 });
  await store.saveSchedule(null);
  assert.equal(await store.loadSchedule(), null);
});

await check('a schedule session stores its week and day', async () => {
  const { session: saved } = await store.saveSession({
    totalReps: 30,
    durationSeconds: 60,
    exerciseId: 'plank',
    program: { level: 'beginner', week: 2, day: 3 },
  });
  assert.deepEqual(saved.program, { level: 'beginner', week: 2, day: 3 });
  assert.equal(saved.exerciseId, 'plank');
});

await check('new settings have defaults and clearAllData wipes everything', async () => {
  const settings = await store.loadSettings();
  assert.equal(settings.dailyGoal, 50);
  assert.equal(settings.countdownSeconds, 5);
  assert.equal(settings.language, 'auto');
  assert.equal(settings.onboardingDone, false);
  assert.equal(settings.blockerSecondsPerRep, DEFAULT_RATE_SECONDS);
  assert.deepEqual(settings.blockerSites, []);
  await store.saveProgram({ level: 1, completedDays: {} });
  await store.saveSchedule({ level: 'beginner', completed: {} });
  await store.clearAllData();
  assert.equal(await store.loadProgram(), null);
  assert.equal(await store.loadSchedule(), null);
  assert.deepEqual(await store.loadSessions(), []);
});

await check('a schedule keeps its slots, cycle and test date through storage; junk is dropped', async () => {
  await store.saveSchedule({ level: 'beginner', completed: {}, slots: { hpush: { rung: 2, target: 9 } }, cycle: 2, tested: 5 });
  let loaded = await store.loadSchedule();
  assert.deepEqual(loaded.slots, { hpush: { rung: 2, target: 9 } });
  assert.equal(loaded.cycle, 2);
  assert.equal(loaded.tested, 5);
  await store.saveSchedule({ level: 'beginner', completed: {}, slots: [1], cycle: -3 });
  loaded = await store.loadSchedule();
  assert.equal(loaded.slots, null);
  assert.equal(loaded.cycle, 1);
  assert.equal(loaded.tested, null);
  await store.clearAllData();
});

// --- the last seven days against the WHO guideline ------------------------------
group('weekly training');

await check('strength days, minutes and sets per main muscle over the last seven days', () => {
  const now = at(0, 20);
  const sessions = [
    session(0, 20, { exerciseId: 'squat', sets: [{ reps: 10 }, { reps: 10 }], durationSeconds: 120 }),
    session(1, 30, { durationSeconds: 90 }), // push-ups, one set
    session(1, 40, { exerciseId: 'jumpingjack', durationSeconds: 60 }), // cardio: minutes only
    session(9, 50, { exerciseId: 'squat' }), // too old
  ];
  const week = weekly.weekTraining(sessions, now);
  assert.equal(week.strengthDays, 2);
  assert.equal(week.minutes, 4);
  assert.equal(week.sets.legs, 2);
  assert.equal(week.sets.chest, 1);
  assert.equal(week.sets.glutes, 0, 'only the main muscle is credited');
  assert.ok(!('cardio' in week.sets));
  assert.deepEqual(weekly.weekTraining([], now), { strengthDays: 0, minutes: 0, sets: Object.fromEntries(weekly.MUSCLE_PARTS.map((p) => [p, 0])) });
});

// --- report ------------------------------------------------------------------
console.log(`\n${state.passed} passed, ${state.failed} failed`);
process.exit(state.failed ? 1 : 0);
