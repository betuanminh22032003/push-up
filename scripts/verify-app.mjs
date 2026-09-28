/**
 * Assertions for the program generator, achievements, the extended stats and
 * storage shape, and the two translation tables.
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

const program = await bundle(programSrc);
const achievements = await bundle(
  timeSrc,
  programSrc,
  stripImport(stripImport(read('src/achievements/achievements.js'), '../utils/time'), '../program/program'),
);
const stats = await bundle(timeSrc, stripImport(read('src/utils/stats.js'), './time'));
const strings = await bundle(read('src/i18n/strings.js'));
const blocker = await bundle(read('src/blocker/blockerLogic.js'));
const store = await asModule(
  read('src/storage/sessions.js').replace(
    "import AsyncStorage from '@react-native-async-storage/async-storage';",
    MEMORY_ASYNC_STORAGE,
  ),
);

const {
  LEVELS,
  PROGRAM_DAYS,
  SETS_PER_DAY,
  levelForTest,
  dayPlan,
  programFor,
  nextDay,
  isProgramComplete,
  totalTargetReps,
} = program;
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

// --- program ---------------------------------------------------------------
group('program');

await check('levelForTest maps the test result onto the five levels', () => {
  assert.equal(levelForTest(0), 1);
  assert.equal(levelForTest(5), 1);
  assert.equal(levelForTest(6), 2);
  assert.equal(levelForTest(10), 2);
  assert.equal(levelForTest(11), 3);
  assert.equal(levelForTest(20), 3);
  assert.equal(levelForTest(21), 4);
  assert.equal(levelForTest(35), 4);
  assert.equal(levelForTest(36), 5);
  assert.equal(levelForTest(200), 5);
  assert.equal(levelForTest(undefined), 1, 'garbage input is level 1, not a crash');
});

await check('a day has five sets and only the last is a max set', () => {
  const plan = dayPlan(3, 1);
  assert.equal(plan.sets.length, SETS_PER_DAY);
  assert.deepEqual(
    plan.sets.map((s) => s.max),
    [false, false, false, false, true],
  );
  assert.equal(plan.day, 1);
  assert.equal(plan.week, 1);
  assert.equal(plan.level, 3);
});

await check('targets never decrease from one day to the next, at every level', () => {
  for (const level of LEVELS) {
    const days = programFor(level.id);
    assert.equal(days.length, PROGRAM_DAYS);
    for (let i = 1; i < days.length; i += 1) {
      for (let s = 0; s < SETS_PER_DAY; s += 1) {
        assert.ok(
          days[i].sets[s].target >= days[i - 1].sets[s].target,
          `level ${level.id} day ${i + 1} set ${s + 1} dropped`,
        );
      }
    }
  }
});

await check('the program roughly doubles to triples the first-day sets by week 6', () => {
  for (const level of LEVELS) {
    const first = dayPlan(level.id, 1).sets[0].target;
    const last = dayPlan(level.id, PROGRAM_DAYS).sets[0].target;
    const ratio = last / first;
    assert.ok(ratio >= 1.9 && ratio <= 3.2, `level ${level.id}: x${ratio.toFixed(2)}`);
  }
  // A beginner starts small and a strong starter starts strong.
  assert.ok(dayPlan(1, 1).sets[0].target <= 5);
  assert.ok(dayPlan(5, 1).sets[0].target >= 20);
});

await check('rest lengthens by week: 60, 60, 90, 90, 120, 120', () => {
  const rests = [1, 4, 7, 10, 13, 16].map((day) => dayPlan(2, day).restSeconds);
  assert.deepEqual(rests, [60, 60, 90, 90, 120, 120]);
});

await check('day numbers are clamped into the program', () => {
  assert.equal(dayPlan(2, 0).day, 1);
  assert.equal(dayPlan(2, 99).day, PROGRAM_DAYS);
  assert.equal(dayPlan(2, 7).week, 3);
});

await check('totalTargetReps sums every set target', () => {
  const plan = dayPlan(1, 1);
  assert.equal(
    totalTargetReps(plan),
    plan.sets.reduce((sum, s) => sum + s.target, 0),
  );
});

await check('nextDay is the first day not done; complete once all 18 are', () => {
  assert.equal(nextDay({}), 1);
  assert.equal(nextDay({ 1: 1, 2: 1 }), 3);
  assert.equal(nextDay({ 1: 1, 3: 1 }), 2, 'a skipped day comes back around');
  const all = {};
  for (let d = 1; d <= PROGRAM_DAYS; d += 1) all[d] = 1;
  assert.equal(nextDay(all), null);
  assert.equal(isProgramComplete(all), true);
  assert.equal(isProgramComplete({ 1: 1 }), false);
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

await check('program badges come from completed days', () => {
  assert.ok(unlockedAchievements([session(0, 5)], { 1: 1 }).includes('program_day'));
  const all = {};
  for (let d = 1; d <= PROGRAM_DAYS; d += 1) all[d] = 1;
  assert.ok(unlockedAchievements([session(0, 5)], all).includes('program_done'));
  assert.ok(!unlockedAchievements([session(0, 5)], { 1: 1 }).includes('program_done'));
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
  const en = Object.keys(STRINGS.en).sort();
  const vi = Object.keys(STRINGS.vi).sort();
  assert.deepEqual(vi, en);
});

await check('placeholders match between languages', () => {
  const params = (text) => (text.match(/\{[a-z]+\}/g) || []).sort();
  for (const key of Object.keys(STRINGS.en)) {
    assert.deepEqual(params(STRINGS.vi[key]), params(STRINGS.en[key]), key);
  }
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
});

await check('reps only earn once the blocker is set up', () => {
  const on = { ...EMPTY_STATE, enabled: true, blocked: ['a'] };
  assert.equal(isSetUp({ ...on, blocked: [] }), false);
  assert.equal(isSetUp({ ...on, enabled: false }), false);
  assert.equal(isSetUp(on), true);
  assert.equal(isSetUp({ ...on, blocked: [], sites: ['vnexpress.net'] }), true, 'sites alone count');
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

await check('new settings have defaults and clearAllData wipes everything', async () => {
  const settings = await store.loadSettings();
  assert.equal(settings.dailyGoal, 50);
  assert.equal(settings.countdownSeconds, 5);
  assert.equal(settings.language, 'auto');
  assert.equal(settings.onboardingDone, false);
  assert.equal(settings.blockerSecondsPerRep, DEFAULT_RATE_SECONDS);
  assert.deepEqual(settings.blockerSites, []);
  await store.saveProgram({ level: 1, completedDays: {} });
  await store.clearAllData();
  assert.equal(await store.loadProgram(), null);
  assert.deepEqual(await store.loadSessions(), []);
});

// --- report ------------------------------------------------------------------
console.log(`\n${state.passed} passed, ${state.failed} failed`);
process.exit(state.failed ? 1 : 0);
