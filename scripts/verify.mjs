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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
const asModule = (source) => import('data:text/javascript,' + encodeURIComponent(source));

// --- load app modules ------------------------------------------------------
// stats.js imports './time', which Node cannot resolve without an extension.
// Concatenating the two sources into one module satisfies the dependency
// without touching either file.
const timeSrc = read('src/utils/time.js');
const statsSrc = read('src/utils/stats.js').replace(/^import .* from '\.\/time';$/m, '');
const time = await asModule(timeSrc);
const stats = await asModule(timeSrc + '\n' + statsSrc);

// sessions.js imports the native AsyncStorage; swap in an in-memory store with
// the same contract so the real read/write logic is exercised.
const MEMORY_SHIM =
  'const _m = new Map();\n' +
  'const AsyncStorage = {\n' +
  '  getItem: async (k) => (_m.has(k) ? _m.get(k) : null),\n' +
  '  setItem: async (k, v) => { _m.set(k, String(v)); },\n' +
  '  removeItem: async (k) => { _m.delete(k); },\n' +
  '};\n' +
  'export const __mem = _m;';
const store = await asModule(
  read('src/storage/sessions.js').replace(
    "import AsyncStorage from '@react-native-async-storage/async-storage';",
    MEMORY_SHIM,
  ),
);

const { formatDuration, dayKey, shiftDayKey, formatSessionDate } = time;
const { computeStats } = stats;

// --- harness ---------------------------------------------------------------
let passed = 0;
let failed = 0;
const check = async (name, fn) => {
  try {
    await fn();
    passed += 1;
    console.log('  ok    ' + name);
  } catch (error) {
    failed += 1;
    console.log('  FAIL  ' + name + '\n        ' + error.message.split('\n')[0]);
  }
};
const group = (name) => console.log('\n' + name);

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

await check('clearSessions empties the store', async () => {
  await store.saveSession({ totalReps: 1, durationSeconds: 1 });
  assert.deepEqual(await store.clearSessions(), []);
  assert.deepEqual(await store.loadSessions(), []);
});

await check('settings round-trip and merge onto defaults', async () => {
  assert.deepEqual(await store.loadSettings(), {
    sourceId: null,
    soundEnabled: true,
    hapticsEnabled: true,
  });
  await store.saveSettings({ sourceId: 'tap', soundEnabled: false, hapticsEnabled: true });
  assert.equal((await store.loadSettings()).soundEnabled, false);

  store.__mem.set('pupg:settings:v1', JSON.stringify({ soundEnabled: false }));
  const merged = await store.loadSettings();
  assert.equal(merged.hapticsEnabled, true, 'absent keys fall back to defaults');
  assert.equal(merged.soundEnabled, false);
});

// --- result ----------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
