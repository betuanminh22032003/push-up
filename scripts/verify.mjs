/**
 * Assertions for the logic that is easiest to get quietly wrong: duration
 * formatting, local day keys, streak arithmetic and the storage round-trip.
 *
 *   npm run verify
 *
 * Runs on plain Node with no test framework. The app's modules are written for
 * Metro (extensionless imports, a native AsyncStorage), so each one is loaded
 * through a small shim that rewrites those imports for Node — the module source
 * itself is the real thing, unmodified.
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
const time = await bundle(timeSrc);
const stats = await bundle(timeSrc, stripImport(read('src/utils/stats.js'), './time'));

const store = await asModule(
  read('src/storage/sessions.js').replace(
    "import AsyncStorage from '@react-native-async-storage/async-storage';",
    MEMORY_ASYNC_STORAGE,
  ),
);

const { formatDuration, dayKey, shiftDayKey, formatSessionDate } = time;
const { computeStats } = stats;

// --- harness ---------------------------------------------------------------
const { state, group, check } = createHarness();

// --- time ------------------------------------------------------------------
group('time');

await check('formatDuration pads to MM:SS', () => {
  assert.equal(formatDuration(0), '00:00');
  assert.equal(formatDuration(9), '00:09');
  assert.equal(formatDuration(65), '01:05');
  assert.equal(formatDuration(599), '09:59');
});

await check('formatDuration grows an hours field past 3600s', () => {
  assert.equal(formatDuration(3600), '1:00:00');
  assert.equal(formatDuration(3725), '1:02:05');
});

await check('formatDuration clamps negatives to zero', () => {
  assert.equal(formatDuration(-5), '00:00');
});

await check('dayKey uses the local calendar, zero-padded', () => {
  assert.equal(dayKey(new Date(2026, 2, 5, 23, 59, 59).getTime()), '2026-03-05');
  assert.equal(dayKey(new Date(2026, 2, 6, 0, 0, 1).getTime()), '2026-03-06');
});

await check('shiftDayKey crosses month and year boundaries', () => {
  assert.equal(shiftDayKey(new Date(2026, 2, 1, 10).getTime(), -1), '2026-02-28');
  assert.equal(shiftDayKey(new Date(2026, 0, 1, 10).getTime(), -1), '2025-12-31');
  assert.equal(shiftDayKey(new Date(2024, 2, 1, 10).getTime(), -1), '2024-02-29');
});

await check('formatSessionDate labels today and yesterday', () => {
  const now = new Date(2026, 8, 13, 18).getTime();
  assert.match(formatSessionDate(new Date(2026, 8, 13, 9).getTime(), now), /^Today /);
  assert.match(formatSessionDate(new Date(2026, 8, 12, 9).getTime(), now), /^Yesterday /);
  assert.doesNotMatch(formatSessionDate(new Date(2026, 8, 10, 9).getTime(), now), /Today|Yesterday/);
});

// --- stats -----------------------------------------------------------------
group('stats');

const NOW = new Date(2026, 8, 13, 18).getTime();
let seq = 0;
const session = (daysAgo, reps, hour = 9, durationSeconds = 30) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return { id: 's' + seq++, timestamp: d.getTime(), totalReps: reps, durationSeconds };
};

await check('empty history is all zeroes', () => {
  const s = computeStats([], NOW);
  assert.deepEqual(
    [s.totalReps, s.todayReps, s.streak, s.sessionCount, s.bestSession, s.activeDays],
    [0, 0, 0, 0, 0, 0],
  );
});

await check('totals, today, best and time aggregate correctly', () => {
  const s = computeStats(
    [session(0, 20, 9, 60), session(0, 15, 17, 45), session(3, 40, 9, 120)],
    NOW,
  );
  assert.equal(s.totalReps, 75);
  assert.equal(s.todayReps, 35, 'two sessions on the same day must sum');
  assert.equal(s.bestSession, 40);
  assert.equal(s.totalSeconds, 225);
  assert.equal(s.sessionCount, 3);
  assert.equal(s.activeDays, 2);
});

await check('streak counts consecutive days ending today', () => {
  const s = computeStats([session(0, 10), session(1, 10), session(2, 10), session(4, 10)], NOW);
  assert.equal(s.streak, 3, 'the gap at day 3 ends it');
});

await check('an unfinished today does not break a live streak', () => {
  const s = computeStats([session(1, 10), session(2, 10)], NOW);
  assert.equal(s.streak, 2);
  assert.equal(s.todayReps, 0);
});

await check('a two-day gap ends the streak', () => {
  assert.equal(computeStats([session(2, 10), session(3, 10)], NOW).streak, 0);
});

await check('zero-rep sessions never prop up a streak', () => {
  const s = computeStats([session(0, 0), session(1, 10)], NOW);
  assert.equal(s.streak, 1, 'today holds no real reps, so only yesterday counts');
  assert.equal(s.activeDays, 1);
});

await check('a single session today is a one-day streak', () => {
  assert.equal(computeStats([session(0, 1)], NOW).streak, 1);
});

// --- storage ---------------------------------------------------------------
group('storage');

await check('empty store reads as an empty list', async () => {
  assert.deepEqual(await store.loadSessions(), []);
});

await check('saveSession writes the documented shape', async () => {
  const { session: saved } = await store.saveSession({
    totalReps: 20,
    durationSeconds: 63,
    sourceId: 'light',
  });
  assert.deepEqual(
    Object.keys(saved).sort(),
    ['durationSeconds', 'id', 'sourceId', 'timestamp', 'totalReps'],
  );
  assert.equal(saved.totalReps, 20);
  assert.equal(saved.durationSeconds, 63);
});

await check('a push-up session keeps that shape: no exerciseId', async () => {
  const { session: saved } = await store.saveSession({
    totalReps: 20,
    durationSeconds: 63,
    sourceId: 'light',
    exerciseId: 'pushup',
  });
  assert.deepEqual(
    Object.keys(saved).sort(),
    ['durationSeconds', 'id', 'sourceId', 'timestamp', 'totalReps'],
  );
});

await check('any other exercise is stored by id and reads back', async () => {
  const { session: saved } = await store.saveSession({
    totalReps: 15,
    durationSeconds: 40,
    sourceId: 'motion',
    exerciseId: 'squat',
  });
  assert.equal(saved.exerciseId, 'squat');
  const back = (await store.loadSessions()).find((s) => s.id === saved.id);
  assert.equal(back.exerciseId, 'squat');
  for (const junk of [null, '', 42, {}]) {
    const { session: s } = await store.saveSession({ totalReps: 1, durationSeconds: 1, exerciseId: junk });
    assert.equal(s.exerciseId, undefined, `exerciseId ${JSON.stringify(junk)} is not stored`);
  }
});

await check('values are rounded and clamped at zero', async () => {
  const { session: saved } = await store.saveSession({ totalReps: 7.6, durationSeconds: -4 });
  assert.equal(saved.totalReps, 8);
  assert.equal(saved.durationSeconds, 0);
});

await check('sessions read back newest-first', async () => {
  await store.saveSession({ totalReps: 5, durationSeconds: 10, timestamp: 1000 });
  await store.saveSession({ totalReps: 5, durationSeconds: 10, timestamp: 9000 });
  const all = await store.loadSessions();
  for (let i = 1; i < all.length; i++) {
    assert.ok(all[i - 1].timestamp >= all[i].timestamp);
  }
});

await check('ids are unique', async () => {
  const all = await store.loadSessions();
  assert.equal(new Set(all.map((s) => s.id)).size, all.length);
});

await check('deleteSession removes only the target', async () => {
  const before = await store.loadSessions();
  const victim = before[1];
  const after = await store.deleteSession(victim.id);
  assert.equal(after.length, before.length - 1);
  assert.ok(!after.some((s) => s.id === victim.id));
});

await check('deleting an unknown id is a no-op', async () => {
  const before = await store.loadSessions();
  assert.equal((await store.deleteSession('nope')).length, before.length);
});

await check('corrupt JSON degrades to empty instead of throwing', async () => {
  store.__mem.set('pupg:sessions:v1', '{not json');
  assert.deepEqual(await store.loadSessions(), []);
});

await check('malformed records are dropped, valid ones kept', async () => {
  store.__mem.set(
    'pupg:sessions:v1',
    JSON.stringify([
      { id: 'good', timestamp: 5, totalReps: 3, durationSeconds: 9 },
      { id: 'no-reps', timestamp: 5, durationSeconds: 9 },
      { timestamp: 5, totalReps: 3, durationSeconds: 9 },
      null,
      'garbage',
      42,
    ]),
  );
  const all = await store.loadSessions();
  assert.equal(all.length, 1);
  assert.equal(all[0].id, 'good');
});

await check('broken sets from a hand-edited backup are cleaned, never thrown on', async () => {
  store.__mem.set(
    'pupg:sessions:v1',
    JSON.stringify([
      { id: 'a', timestamp: 9, totalReps: 5, durationSeconds: 9, sets: [null, { reps: 5 }] },
      { id: 'b', timestamp: 8, totalReps: 9, durationSeconds: 9, sets: [{ reps: 4 }, { reps: 5.2 }, 'x'] },
      { id: 'c', timestamp: 7, totalReps: 3, durationSeconds: 9, sets: 'nope' },
    ]),
  );
  const all = await store.loadSessions();
  assert.deepEqual(all.map((s) => s.id), ['a', 'b', 'c']);
  assert.equal(all[0].sets, undefined, 'one real set is stored without sets');
  assert.deepEqual(all[1].sets.map((x) => x.reps), [4, 5]);
  assert.equal(all[2].sets, undefined);
  assert.doesNotThrow(() => computeStats(all, NOW));
});

await check('negative counts and dates past what a Date holds are refused', () => {
  const base = { id: 'x', timestamp: 5, totalReps: 3, durationSeconds: 9 };
  assert.ok(store.isValidSession(base));
  assert.ok(!store.isValidSession({ ...base, totalReps: -1 }));
  assert.ok(!store.isValidSession({ ...base, durationSeconds: -1 }));
  assert.ok(!store.isValidSession({ ...base, timestamp: 9e15 }));
  assert.ok(!store.isValidSession({ ...base, timestamp: 0 }));
});

await check('a history that does not parse is kept aside before a save starts a new one', async () => {
  store.__mem.set('pupg:sessions:v1', '{not json');
  await store.saveSession({ totalReps: 2, durationSeconds: 5 });
  assert.equal(store.__mem.get('pupg:unreadable:v1'), '{not json');
  assert.equal((await store.loadSessions()).length, 1);
  store.__mem.delete('pupg:unreadable:v1');
});

await check('a failed read aborts the save instead of writing over the history', async () => {
  const before = store.__mem.get('pupg:sessions:v1');
  const realGet = store.__mem.get.bind(store.__mem);
  store.__mem.get = (k) => {
    if (k === 'pupg:sessions:v1') throw new Error('Row too big to fit into CursorWindow');
    return realGet(k);
  };
  try {
    await assert.rejects(store.saveSession({ totalReps: 2, durationSeconds: 5 }));
    await assert.rejects(store.deleteSession('anything'));
  } finally {
    store.__mem.get = realGet;
  }
  assert.equal(store.__mem.get('pupg:sessions:v1'), before);
});

await check('sessions saved by one workout share its workoutId', async () => {
  const { session: a } = await store.saveSession({ totalReps: 2, durationSeconds: 5, workoutId: 'w1' });
  const { session: b } = await store.saveSession({ totalReps: 2, durationSeconds: 5 });
  assert.equal(a.workoutId, 'w1');
  assert.equal(b.workoutId, undefined);
});

await check('records from before exercises load beside tagged ones', async () => {
  store.__mem.set(
    'pupg:sessions:v1',
    JSON.stringify([
      { id: 'legacy', timestamp: 5, totalReps: 3, durationSeconds: 9, sourceId: null },
      { id: 'squat', timestamp: 6, totalReps: 4, durationSeconds: 9, exerciseId: 'squat' },
      { id: 'odd', timestamp: 7, totalReps: 4, durationSeconds: 9, exerciseId: 7 },
    ]),
  );
  const all = await store.loadSessions();
  assert.deepEqual(all.map((s) => s.id), ['odd', 'squat', 'legacy'], 'none is dropped');
  assert.equal(all.find((s) => s.id === 'squat').exerciseId, 'squat');
  assert.equal(all.find((s) => s.id === 'legacy').exerciseId, undefined);
});

await check('clearSessions empties the store', async () => {
  await store.saveSession({ totalReps: 1, durationSeconds: 1 });
  assert.deepEqual(await store.clearSessions(), []);
  assert.deepEqual(await store.loadSessions(), []);
});

await check('settings round-trip and merge onto defaults', async () => {
  const defaults = await store.loadSettings();
  assert.equal(defaults.sourceId, null);
  assert.equal(defaults.soundEnabled, true);
  assert.equal(defaults.hapticsEnabled, true);
  await store.saveSettings({ sourceId: 'tap', soundEnabled: false, hapticsEnabled: true });
  assert.equal((await store.loadSettings()).soundEnabled, false);

  store.__mem.set('pupg:settings:v1', JSON.stringify({ soundEnabled: false }));
  const merged = await store.loadSettings();
  assert.equal(merged.hapticsEnabled, true, 'absent keys fall back to defaults');
  assert.equal(merged.soundEnabled, false);
});

await check('exercise settings default to push-ups and round-trip', async () => {
  store.__mem.delete('pupg:settings:v1');
  const defaults = await store.loadSettings();
  assert.equal(defaults.exerciseId, 'pushup');
  assert.deepEqual(defaults.sourceIds, {});
  assert.notEqual(defaults.sourceIds, store.DEFAULT_SETTINGS.sourceIds, 'never the shared default');
  await store.saveSettings({ ...defaults, exerciseId: 'squat', sourceIds: { squat: 'motion', pushup: null } });
  const back = await store.loadSettings();
  assert.equal(back.exerciseId, 'squat');
  assert.deepEqual(back.sourceIds, { squat: 'motion', pushup: null }, 'null is "auto"');

  store.__mem.set('pupg:settings:v1', JSON.stringify({ sourceId: 'light' }));
  const legacy = await store.loadSettings();
  assert.equal(legacy.sourceId, 'light', 'a pre-exercise file keeps its source for push-ups');
  assert.equal(legacy.exerciseId, 'pushup');
  assert.deepEqual(legacy.sourceIds, {});
});

await check('corrupt exercise settings fall back without losing the rest', async () => {
  for (const junk of [null, [], ['motion'], 'motion', 5, true]) {
    store.__mem.set('pupg:settings:v1', JSON.stringify({ sourceIds: junk, soundEnabled: false }));
    const s = await store.loadSettings();
    assert.deepEqual(s.sourceIds, {}, `sourceIds ${JSON.stringify(junk)}`);
    assert.equal(s.soundEnabled, false, 'the other settings still load');
  }
  store.__mem.set(
    'pupg:settings:v1',
    JSON.stringify({ sourceIds: { squat: 'motion', situp: 7, jumpingjack: {} } }),
  );
  assert.deepEqual((await store.loadSettings()).sourceIds, { squat: 'motion' });
  for (const junk of [3, '', null, ['squat']]) {
    store.__mem.set('pupg:settings:v1', JSON.stringify({ exerciseId: junk }));
    assert.equal((await store.loadSettings()).exerciseId, 'pushup', JSON.stringify(junk));
  }
  for (const junk of ['"garbage"', '[1,2]', 'null', '7']) {
    store.__mem.set('pupg:settings:v1', junk);
    const s = await store.loadSettings();
    assert.equal(s.dailyGoal, 50, junk);
    assert.equal(s['0'], undefined, `${junk} is not spread into the settings`);
  }
});

// --- result ----------------------------------------------------------------
console.log(`\n${state.passed} passed, ${state.failed} failed`);
process.exit(state.failed === 0 ? 0 : 1);
