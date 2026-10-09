/**
 * Assertions for the release-readiness features' pure logic: backup files,
 * the crash log, reports, challenge links and runs, the camera's visibility
 * gate, and the camera setup table.
 *
 *   npm run verify
 *
 * Same approach as the other suites: the real modules, loaded as text with
 * their imports rewritten for Node (./load.mjs).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MEMORY_ASYNC_STORAGE, asModule, bundle, createHarness, read, root, stripImport } from './load.mjs';

const ASYNC_IMPORT = "import AsyncStorage from '@react-native-async-storage/async-storage';";
const withMemoryStorage = (source) => source.replace(ASYNC_IMPORT, MEMORY_ASYNC_STORAGE);

// --- load app modules ----------------------------------------------------------
const backup = await bundle(read('src/backup/backup.js'));
const store = await asModule(withMemoryStorage(read('src/storage/sessions.js')));
const timeSrc = read('src/utils/time.js');
const stats = await bundle(timeSrc, stripImport(read('src/utils/stats.js'), './time'));
const errorLog = await asModule(withMemoryStorage(read('src/diagnostics/errorLog.js')));
const report = await bundle(read('src/diagnostics/report.js'));
const exercisesSrc = read('src/exercises/exercises.js');
const exercises = await bundle(exercisesSrc);
const codecSrc = read('src/challenge/codec.js');
const codec = await bundle(codecSrc);
const challenge = await bundle(
  exercisesSrc,
  codecSrc,
  stripImport(stripImport(read('src/challenge/challenge.js'), '../exercises/exercises'), './codec'),
);
const setup = await bundle(exercisesSrc, stripImport(read('src/exercises/cameraSetup.js'), './exercises'));
const strings = await bundle(
  read('src/i18n/exerciseStrings.js'),
  read('src/i18n/featureStrings.js'),
  read('src/i18n/guideStrings.js'),
  stripImport(stripImport(stripImport(read('src/i18n/strings.js'), './exerciseStrings'), './featureStrings'), './guideStrings'),
);

/** The pose modules in the page's order, as verify-pose loads them. */
const POSE_MODULES = [
  'geometry',
  'landmarks',
  'repEngine',
  'readings',
  'pushupAnalyzer',
  'squatAnalyzer',
  'situpAnalyzer',
  'jumpingJackAnalyzer',
  'upperBodyAnalyzers',
  'lowerBodyAnalyzers',
  'coreAnalyzers',
  'holdAnalyzers',
  'visibility',
  'analyzers',
];
const unwrap = (source) =>
  source.replace(/^import[\s\S]*?from\s+'[^']+';\s*$/gm, '').replace(/^export\s*\{[^}]*\};?\s*$/gm, '');
const pose = await bundle(...POSE_MODULES.map((name) => unwrap(read(`src/pose/${name}.js`))));

const { state, group, check } = createHarness();
const { STRINGS } = strings;

const DAY = 24 * 60 * 60 * 1000;
const session = (id, timestamp, totalReps = 10, extra = {}) => ({
  id,
  timestamp,
  totalReps,
  durationSeconds: 30,
  sourceId: 'ai',
  ...extra,
});

// --- backup ---------------------------------------------------------------------
group('backup: writing a file');

const { STORAGE_KEYS, BACKUP_KEYS, isValidSession } = store;
const PARSE = { keys: BACKUP_KEYS, sessionsKey: STORAGE_KEYS.sessions, isValidSession };
const LIST_KEYS = {
  [STORAGE_KEYS.sessions]: 'timestamp',
  [STORAGE_KEYS.challenges]: 'at',
  [STORAGE_KEYS.miscounts]: 'at',
};

await check('every storage key is pupg:*, and a backup carries all but the error log', () => {
  for (const key of Object.values(STORAGE_KEYS)) assert.match(key, /^pupg:[a-z]+:v\d+$/);
  const local = [STORAGE_KEYS.errors, STORAGE_KEYS.unreadable];
  assert.deepEqual(
    [...BACKUP_KEYS].sort(),
    Object.values(STORAGE_KEYS).filter((k) => !local.includes(k)).sort(),
  );
  assert.equal(errorLog.ERROR_LOG_KEY, STORAGE_KEYS.errors);
});

await check('"delete all data" clears every key the app owns, the new ones included', async () => {
  for (const key of Object.values(STORAGE_KEYS)) store.__mem.set(key, '[]');
  await store.clearAllData();
  assert.equal(store.__mem.size, 0);
});

await check('buildBackup keeps parsed values, skips missing and unparseable ones', () => {
  const b = backup.buildBackup(
    {
      [STORAGE_KEYS.sessions]: JSON.stringify([session('a', 1)]),
      [STORAGE_KEYS.settings]: '{"dailyGoal":80}',
      [STORAGE_KEYS.program]: null,
      [STORAGE_KEYS.schedule]: '{broken',
    },
    { appVersion: '1.2.0', platform: 'android', now: Date.UTC(2026, 9, 3) },
  );
  assert.equal(b.format, backup.BACKUP_FORMAT);
  assert.equal(b.version, backup.BACKUP_VERSION);
  assert.equal(b.exportedAt, '2026-10-03T00:00:00.000Z');
  assert.deepEqual(b.app, { version: '1.2.0', platform: 'android' });
  assert.deepEqual(Object.keys(b.data).sort(), [STORAGE_KEYS.sessions, STORAGE_KEYS.settings].sort());
  assert.equal(b.data[STORAGE_KEYS.settings].dailyGoal, 80);
});

await check('the file name is dated in local time', () => {
  assert.equal(backup.backupFileName(new Date(2026, 0, 5, 23, 30).getTime()), 'hitdat-backup-2026-01-05.json');
});

group('backup: reading a file back');

const goodFile = () =>
  JSON.stringify(
    backup.buildBackup({
      [STORAGE_KEYS.sessions]: JSON.stringify([session('a', 3 * DAY), session('b', 2 * DAY)]),
      [STORAGE_KEYS.settings]: JSON.stringify({ dailyGoal: 70 }),
      [STORAGE_KEYS.challenges]: JSON.stringify([{ id: 's-abc123', at: 5 }]),
    }),
  );

await check('a file the app wrote reads back unchanged', () => {
  const r = backup.parseBackup(goodFile(), PARSE);
  assert.equal(r.ok, true);
  assert.equal(r.dropped, 0);
  assert.equal(r.backup.data[STORAGE_KEYS.sessions].length, 2);
  assert.equal(r.backup.data[STORAGE_KEYS.settings].dailyGoal, 70);
});

await check('every kind of bad file is refused with its reason', () => {
  const parse = (text) => backup.parseBackup(text, PARSE);
  assert.equal(parse('').error, 'empty');
  assert.equal(parse('   ').error, 'empty');
  assert.equal(parse(null).error, 'empty');
  assert.equal(parse('{nope').error, 'json');
  assert.equal(parse('[]').error, 'format');
  assert.equal(parse('{"format":"something-else","version":1,"data":{}}').error, 'format');
  assert.equal(parse('{"format":"hitdat-backup","version":2,"data":{}}').error, 'version');
  assert.equal(parse('{"format":"hitdat-backup","version":0,"data":{}}').error, 'version');
  assert.equal(parse('{"format":"hitdat-backup","version":1,"data":[]}').error, 'data');
  assert.equal(
    parse(JSON.stringify({ format: 'hitdat-backup', version: 1, data: { [STORAGE_KEYS.sessions]: {} } })).error,
    'data',
  );
  assert.equal(parse('x'.repeat(backup.MAX_BACKUP_BYTES + 1)).error, 'tooLarge');
});

await check('broken sessions and unknown keys are dropped, the rest kept', () => {
  const text = JSON.stringify({
    format: 'hitdat-backup',
    version: 1,
    data: {
      [STORAGE_KEYS.sessions]: [session('a', 1), { id: 7 }, null, session('b', 2, 'x')],
      [STORAGE_KEYS.settings]: 'not an object',
      'someone-else:key': { a: 1 },
      [STORAGE_KEYS.errors]: [{ message: 'not restored' }],
    },
  });
  const r = backup.parseBackup(text, PARSE);
  assert.equal(r.ok, true);
  assert.deepEqual(r.backup.data[STORAGE_KEYS.sessions].map((s) => s.id), ['a']);
  assert.equal(r.dropped, 4); // three sessions and the settings string
  assert.deepEqual(Object.keys(r.backup.data), [STORAGE_KEYS.sessions]);
});

await check('the preview counts sessions, spans the dates and reads the streak at the end', () => {
  const day = (n) => new Date(2026, 8, n, 12).getTime();
  const r = backup.parseBackup(
    JSON.stringify(
      backup.buildBackup({
        [STORAGE_KEYS.sessions]: JSON.stringify([
          session('c', day(10), 5),
          session('b', day(9), 5),
          session('a', day(1), 5),
        ]),
      }),
    ),
    PARSE,
  );
  const summary = backup.summarizeBackup(r.backup, {
    sessionsKey: STORAGE_KEYS.sessions,
    streakOf: (sessions, at) => stats.computeStats(sessions, at).streak,
  });
  assert.equal(summary.sessions, 3);
  assert.equal(summary.totalReps, 15);
  assert.equal(summary.firstAt, day(1));
  assert.equal(summary.lastAt, day(10));
  // Two days in a row at the end, however long ago that was.
  assert.equal(summary.streak, 2);
});

group('backup: restoring');

await check('merge joins sessions by id: nothing here changes, only new ones are added', () => {
  const here = [session('a', 3, 10), session('b', 2, 10)];
  const there = [session('b', 2, 999), session('c', 5, 10)];
  const { list, added } = backup.mergeById(here, there);
  assert.deepEqual(list.map((s) => s.id), ['c', 'a', 'b']);
  assert.equal(list.find((s) => s.id === 'b').totalReps, 10);
  assert.equal(added, 1);
});

await check('merge takes settings and schedule only where the phone has none', () => {
  const r = backup.parseBackup(goodFile(), PARSE);
  const current = {
    [STORAGE_KEYS.sessions]: [session('z', 9 * DAY)],
    [STORAGE_KEYS.settings]: { dailyGoal: 30 },
    [STORAGE_KEYS.schedule]: null,
  };
  const { writes, added } = backup.planRestore(r.backup, current, 'merge', { keys: BACKUP_KEYS, listKeys: LIST_KEYS });
  assert.deepEqual(writes[STORAGE_KEYS.sessions].map((s) => s.id), ['z', 'a', 'b']);
  assert.equal(added[STORAGE_KEYS.sessions], 2);
  assert.equal(STORAGE_KEYS.settings in writes, false); // kept as it is
  assert.equal(writes[STORAGE_KEYS.challenges].length, 1);
  assert.equal(STORAGE_KEYS.schedule in writes, false); // the backup has none either
});

await check('replace writes the backup as is and clears what it lacks', () => {
  const r = backup.parseBackup(goodFile(), PARSE);
  const { writes } = backup.planRestore(
    r.backup,
    { [STORAGE_KEYS.sessions]: [session('z', 1)], [STORAGE_KEYS.schedule]: { level: 'x' } },
    'replace',
    { keys: BACKUP_KEYS, listKeys: LIST_KEYS },
  );
  assert.deepEqual(writes[STORAGE_KEYS.sessions].map((s) => s.id), ['a', 'b']);
  assert.equal(writes[STORAGE_KEYS.schedule], null);
  assert.equal(writes[STORAGE_KEYS.settings].dailyGoal, 70);
  assert.deepEqual(Object.keys(writes).sort(), [...BACKUP_KEYS].sort());
});

await check('a restored file loads through the storage layer like its own writes', async () => {
  const r = backup.parseBackup(goodFile(), PARSE);
  const { writes } = backup.planRestore(r.backup, {}, 'replace', { keys: BACKUP_KEYS, listKeys: LIST_KEYS });
  for (const [key, value] of Object.entries(writes)) {
    if (value == null) store.__mem.delete(key);
    else store.__mem.set(key, JSON.stringify(value));
  }
  assert.deepEqual((await store.loadSessions()).map((s) => s.id), ['a', 'b']);
  const settings = await store.loadSettings();
  assert.equal(settings.dailyGoal, 70);
  assert.equal(settings.challengeName, null);
  assert.deepEqual(settings.setupSeen, {});
});

await check('settings sanitise the new fields', async () => {
  store.__mem.set(STORAGE_KEYS.settings, JSON.stringify({ challengeName: 42, setupSeen: { pushup: true, squat: 'yes' } }));
  const s = await store.loadSettings();
  assert.equal(s.challengeName, null);
  assert.deepEqual(s.setupSeen, { pushup: true });
  store.__mem.set(STORAGE_KEYS.settings, JSON.stringify({ challengeName: 'Minh', setupSeen: [] }));
  const t = await store.loadSettings();
  assert.equal(t.challengeName, 'Minh');
  assert.deepEqual(t.setupSeen, {});
});

// --- crash log --------------------------------------------------------------------
group('crash log');

await check('anything thrown becomes an entry, clipped to a sane size', () => {
  const e = errorLog.normalizeError(new TypeError('x is undefined'), { fatal: true, now: 5 });
  assert.equal(e.message, 'TypeError: x is undefined');
  assert.equal(e.fatal, true);
  assert.equal(e.at, 5);
  assert.equal(e.source, 'global');
  assert.equal(errorLog.normalizeError('plain').message, 'plain');
  assert.equal(errorLog.normalizeError({ code: 3 }).message, '{"code":3}');
  assert.equal(errorLog.normalizeError(undefined).message, 'Unknown error');
  const long = errorLog.normalizeError(new Error('y'.repeat(5000)));
  assert.ok(long.message.length <= 300);
  const deep = new Error('z');
  deep.stack = 'at f\n'.repeat(2000);
  assert.ok(errorLog.normalizeError(deep).stack.length <= 1200);
});

await check('the log is a ring: newest first, never more than 20', () => {
  let log = [];
  for (let i = 0; i < 30; i++) log = errorLog.appendError(log, errorLog.normalizeError(`e${i}`, { now: i }));
  assert.equal(log.length, errorLog.ERROR_LOG_LIMIT);
  assert.equal(log[0].message, 'e29');
  assert.equal(log[19].message, 'e10');
});

await check('the same error repeating is one entry with a count', () => {
  let log = [];
  for (let i = 0; i < 50; i++) log = errorLog.appendError(log, errorLog.normalizeError('loop', { now: i }));
  log = errorLog.appendError(log, errorLog.normalizeError('other', { now: 99 }));
  assert.equal(log.length, 2);
  assert.equal(log[1].count, 50);
  assert.equal(log[1].at, 49);
});

await check('errors recorded at once are all kept, on disk, and a corrupt log reads as empty', async () => {
  store.__mem.clear();
  errorLog.__mem.set(errorLog.ERROR_LOG_KEY, '{corrupt');
  assert.deepEqual(await errorLog.loadErrors(), []);
  await Promise.all(Array.from({ length: 25 }, (_, i) => errorLog.recordError(new Error(`boom ${i}`))));
  const log = await errorLog.loadErrors();
  assert.equal(log.length, 20);
  assert.equal(log[0].message, 'Error: boom 24');
  await errorLog.clearErrors();
  assert.deepEqual(await errorLog.loadErrors(), []);
});

// --- reports ----------------------------------------------------------------------
group('reports');

await check('a miscount is built only from a real number', () => {
  const s = { exerciseId: 'squat', sourceId: 'ai', totalReps: 18, durationSeconds: 40, timestamp: 7 };
  const r = report.buildMiscount({ id: 'm1', session: s, view: 'front', realText: ' 20 ', note: '  dim  ', now: 9 });
  assert.deepEqual(r, {
    id: 'm1',
    at: 9,
    sessionAt: 7,
    exerciseId: 'squat',
    sourceId: 'ai',
    view: 'front',
    counted: 18,
    real: 20,
    durationSeconds: 40,
    note: 'dim',
  });
  for (const bad of ['', 'abc', '-1', '1.5', '12345']) {
    assert.equal(report.buildMiscount({ id: 'x', session: s, realText: bad }), null, bad);
  }
  assert.equal(report.buildMiscount({ id: 'x', session: s, realText: '0' }).real, 0);
  assert.equal(report.buildMiscount({ id: 'x', session: s, realText: '5', note: 'n'.repeat(900) }).note.length, report.NOTE_MAX);
});

await check('a report says what it carries, and only the latest few errors', () => {
  const errors = Array.from({ length: 8 }, (_, i) => ({
    at: i,
    message: `Error: e${i}`,
    stack: `Error: e${i}\n    at one\n    at two\n    at three\n    at four`,
    source: 'global',
    fatal: i === 0,
  }));
  const text = report.formatReport({
    intro: 'Hello',
    app: { version: '1.0.0', build: 3 },
    device: { os: 'android', osVersion: '14 (API 34)', brand: 'realme', model: 'RMX3370' },
    miscount: { exerciseId: 'pushup', view: 'side', sourceId: 'ai', counted: 18, real: 20, at: 0, note: 'dark' },
    errors,
    language: 'vi',
    now: 0,
  });
  assert.match(text, /^Hello/);
  assert.match(text, /Hít Đất AI 1\.0\.0 \(3\)/);
  assert.match(text, /realme RMX3370 · android 14 \(API 34\)/);
  assert.match(text, /Counted: 18 · Real: 20 · Off by: 2/);
  assert.match(text, /camera side view/);
  assert.match(text, /Note: dark/);
  assert.match(text, /Recent errors \(5\)/);
  assert.match(text, /e4/);
  assert.doesNotMatch(text, /e5/);
  assert.doesNotMatch(text, /at four/);
  const empty = report.formatReport({ errors: [] });
  assert.match(empty, /Recent errors \(0\) ---\nnone/);
});

// --- challenge links ----------------------------------------------------------------
group('challenge links');

const sample = {
  exerciseId: 'pushup',
  format: 'reps',
  durationSeconds: 60,
  name: 'Tuấn Minh 💪',
  score: 42,
  at: Date.UTC(2026, 9, 3, 8),
  id: 'ab12cd',
};

await check('a challenge survives the round trip, Vietnamese and emoji included', () => {
  const token = codec.encodeChallenge(sample);
  assert.match(token, /^[A-Za-z0-9_-]+\.[0-9a-z]{7}$/);
  const r = codec.decodeChallenge(token);
  assert.equal(r.ok, true);
  assert.deepEqual(r.challenge, {
    version: 1,
    exerciseId: 'pushup',
    format: 'reps',
    durationSeconds: 60,
    name: 'Tuấn Minh 💪',
    score: 42,
    at: sample.at,
    id: 'ab12cd',
    replyTo: null,
  });
  const hold = codec.decodeChallenge(
    codec.encodeChallenge({ ...sample, exerciseId: 'plank', format: 'hold', durationSeconds: 60, replyTo: 'zz9900' }),
  );
  assert.equal(hold.challenge.durationSeconds, 0);
  assert.equal(hold.challenge.replyTo, 'zz9900');
});

await check('base64url matches the standard encoding for every length', () => {
  for (const text of ['', 'a', 'ab', 'abc', 'abcd', 'abcde', 'Hít Đất', '⚔️🏆', '\u0000x']) {
    const ours = codec.base64UrlEncode(text);
    assert.equal(ours, Buffer.from(text, 'utf8').toString('base64url'), JSON.stringify(text));
    assert.equal(codec.base64UrlDecode(ours), text);
  }
  assert.equal(codec.base64UrlDecode('a'), null); // impossible length
  assert.equal(codec.base64UrlDecode('ab+/'), null); // not url-safe
  assert.equal(codec.base64UrlDecode('_w'), null); // 0xFF is not UTF-8
});

await check('the checksum catches a changed character or a link cut short', () => {
  const token = codec.encodeChallenge(sample);
  const [body, sum] = token.split('.');
  const flipped = (body[5] === 'A' ? 'B' : 'A');
  assert.equal(codec.decodeChallenge(`${body.slice(0, 5)}${flipped}${body.slice(6)}.${sum}`).error, 'checksum');
  assert.equal(codec.decodeChallenge(`${body.slice(0, -2)}.${sum}`).error, 'checksum');
  assert.equal(codec.decodeChallenge(token.slice(0, -1)).error, 'format');
  assert.equal(codec.decodeChallenge(body).error, 'format');
});

await check('invalid input is refused, never thrown', () => {
  const forge = (payload) => {
    const body = codec.base64UrlEncode(typeof payload === 'string' ? payload : JSON.stringify(payload));
    return `${body}.${codec.checksum(body)}`;
  };
  const base = { v: 1, e: 'pushup', f: 'reps', d: 60, n: '', s: 10, t: 1, i: 'abc123' };
  assert.equal(codec.decodeChallenge('').error, 'empty');
  assert.equal(codec.decodeChallenge(undefined).error, 'empty');
  assert.equal(codec.decodeChallenge('hello world').error, 'format');
  assert.equal(codec.decodeChallenge(forge('{not json')).error, 'payload');
  assert.equal(codec.decodeChallenge(forge('[1,2]')).error, 'payload');
  assert.equal(codec.decodeChallenge(forge(base)).ok, true);
  for (const bad of [
    { v: 2 },
    { e: 'Push-Up' },
    { e: '' },
    { f: 'distance' },
    { d: 45 },
    { f: 'hold', d: 60 },
    { s: -1 },
    { s: 10000 },
    { s: 1.5 },
    { t: -5 },
    { i: 'x' },
    { i: 'UPPER1' },
    { n: 5 },
    { r: 'bad id!' },
  ]) {
    assert.equal(codec.decodeChallenge(forge({ ...base, ...bad })).ok, false, JSON.stringify(bad));
  }
  assert.throws(() => codec.encodeChallenge({ ...sample, durationSeconds: 45 }));
});

await check('names are one clean line of at most 24 characters', () => {
  assert.equal(codec.cleanName('  Minh\n\tTuấn  '), 'Minh Tuấn');
  assert.equal(codec.cleanName('a‮b​c'), 'a b c');
  assert.equal(Array.from(codec.cleanName('😀'.repeat(40))).length, codec.NAME_MAX);
  assert.equal(codec.cleanName(null), '');
});

await check('the token is found in every URL a challenge arrives by', () => {
  const token = codec.encodeChallenge(sample);
  assert.equal(codec.extractChallengeToken(codec.challengeWebUrl(token)), token);
  assert.equal(codec.extractChallengeToken(codec.challengeAppUrl(token)), token);
  assert.equal(codec.extractChallengeToken(`http://localhost:8081/#c=${token}`), token);
  assert.equal(codec.extractChallengeToken(`http://localhost:8081/?c=${token}&x=1`), token);
  assert.equal(codec.extractChallengeToken('hitdat://'), null);
  assert.equal(codec.extractChallengeToken('https://example.com/#hello'), null);
  assert.equal(codec.extractChallengeToken(null), null);
  assert.ok(codec.challengeWebUrl(token).startsWith('https://betuanminh22032003.github.io/push-up/challenge.html#'));
});

await check('the Android intent link opens the app, else the Play Store', () => {
  const url = codec.challengeIntentUrl('abc.0000000');
  assert.match(url, /^intent:\/\/challenge\?c=abc\.0000000#Intent;/);
  assert.match(url, /scheme=hitdat;/);
  assert.match(url, /package=com\.betuanminh\.hitdat;/);
  assert.match(url, /S\.browser_fallback_url=https%3A%2F%2Fplay\.google\.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom\.betuanminh\.hitdat;end$/);
});

await check('ids are six base-36 characters', () => {
  for (let i = 0; i < 50; i++) assert.match(codec.randomChallengeId(), /^[a-z0-9]{6}$/);
});

await check('app.json registers the scheme the links use', () => {
  const app = JSON.parse(readFileSync(path.join(root, 'app.json'), 'utf8'));
  assert.equal(app.expo.scheme, codec.APP_SCHEME);
  assert.equal(app.expo.android.package, codec.ANDROID_PACKAGE);
});

// --- challenge runs ------------------------------------------------------------------
group('challenge: timer and scoring');

await check('rep exercises run 30, 60 or 120 s; holds run until the form breaks', () => {
  assert.deepEqual(challenge.formatsFor('pushup').map((f) => f.durationSeconds), [30, 60, 120]);
  assert.deepEqual(challenge.formatsFor('plank'), [{ format: 'hold', durationSeconds: 0 }]);
  assert.equal(challenge.isPlayable({ exerciseId: 'plank', format: 'hold' }), true);
  assert.equal(challenge.isPlayable({ exerciseId: 'plank', format: 'reps' }), false);
  assert.equal(challenge.isPlayable({ exerciseId: 'pushup', format: 'hold' }), false);
  assert.equal(challenge.isPlayable({ exerciseId: 'flyingkick', format: 'reps' }), false);
  assert.equal(challenge.isRankedSource('ai'), true);
  for (const id of ['tap', 'motion', 'light', 'timer']) assert.equal(challenge.isRankedSource(id), false);
});

await check('only reps inside the window count', () => {
  const run = challenge.createChallengeRun({ format: 'reps', durationSeconds: 30 });
  assert.equal(run.rep(0), false); // not started
  run.start(1000);
  assert.equal(run.tick(1000).remaining, 30);
  for (let t = 1500; t < 31000; t += 1000) assert.equal(run.rep(t), true);
  assert.equal(run.score, 30);
  assert.equal(run.tick(30999).over, false);
  assert.equal(run.tick(30999).remaining, 1);
  const end = run.tick(31000);
  assert.equal(end.over, true);
  assert.equal(end.reason, 'time');
  assert.equal(end.remaining, 0);
  assert.equal(run.rep(31001), false); // after the buzzer
  assert.equal(run.score, 30);
  assert.equal(run.durationSeconds(), 30);
});

await check('a rep arriving late, before anyone ticked, still does not count', () => {
  const run = challenge.createChallengeRun({ format: 'reps', durationSeconds: 60 });
  run.start(0);
  run.rep(59000);
  assert.equal(run.rep(61000), false);
  assert.equal(run.over, true);
  assert.equal(run.score, 1);
});

await check('a hold ends at its last counted second once the form breaks', () => {
  const run = challenge.createChallengeRun({ format: 'hold', durationSeconds: 0 });
  run.start(0);
  for (let t = 2000; t <= 46000; t += 1000) run.rep(t); // 45 seconds held
  assert.equal(run.tick(48000).over, false);
  const end = run.tick(49000);
  assert.equal(end.over, true);
  assert.equal(end.reason, 'broken');
  assert.equal(end.score, 45);
  assert.equal(run.durationSeconds(), 46);
});

await check('a hold that never starts ends after the grace period with nothing', () => {
  const run = challenge.createChallengeRun({ format: 'hold', durationSeconds: 0 });
  run.start(0);
  assert.equal(run.tick(14000).over, false);
  const end = run.tick(15000);
  assert.equal(end.over, true);
  assert.equal(end.score, 0);
});

await check('a hold is capped, and Stop ends any run', () => {
  const run = challenge.createChallengeRun({ format: 'hold', durationSeconds: 0 });
  run.start(0);
  for (let i = 1; i <= challenge.HOLD_CAP_SECONDS + 5; i++) run.rep(i * 1000);
  assert.equal(run.score, challenge.HOLD_CAP_SECONDS);
  assert.equal(run.over, true);
  const stopped = challenge.createChallengeRun({ format: 'reps', durationSeconds: 60 });
  stopped.start(0);
  stopped.rep(500);
  stopped.stop(10000);
  assert.equal(stopped.tick(20000).reason, 'stopped');
  assert.equal(stopped.rep(10500), false);
  assert.equal(stopped.durationSeconds(), 10);
});

await check('win, lose or draw, and the records kept of each', () => {
  assert.equal(challenge.compareScores(5, 4), 'win');
  assert.equal(challenge.compareScores(4, 5), 'lose');
  assert.equal(challenge.compareScores(5, 5), 'draw');
  const received = codec.decodeChallenge(codec.encodeChallenge(sample)).challenge;
  const r = challenge.challengeRecord('received', received, { myScore: 50, now: 9 });
  assert.deepEqual(
    [r.id, r.direction, r.opponent, r.theirScore, r.myScore, r.result, r.at],
    ['r-ab12cd', 'received', 'Tuấn Minh 💪', 42, 50, 'win', 9],
  );
  const s = challenge.challengeRecord('sent', sample, { now: 3 });
  assert.deepEqual([s.id, s.myScore, s.theirScore, s.result], ['s-ab12cd', 42, null, null]);
});

// --- visibility gate -------------------------------------------------------------------
group('camera: visibility gate');

const { createVisibilityGate, missingParts, createExerciseGate, POSE_NEEDS, POSE_EXERCISE_IDS, JOINTS } = pose;

/** Every joint in view, confidently, unless `score` overrides some. */
function fullPose(score = {}) {
  const out = {};
  JOINTS.forEach((joint, i) => {
    out[joint] = { x: 0.3 + (i % 3) * 0.1, y: 0.1 + i * 0.06, score: joint in score ? score[joint] : 0.95 };
  });
  return out;
}

await check('every camera exercise says which joints it needs', () => {
  assert.deepEqual(Object.keys(POSE_NEEDS).sort(), [...POSE_EXERCISE_IDS].sort());
  for (const [id, needs] of Object.entries(POSE_NEEDS)) {
    assert.ok(needs.length > 0, id);
    for (const g of needs) {
      assert.ok(['either', 'both', 'any'].includes(g.sides), id);
      for (const j of g.joints) assert.ok(j === 'nose' || JOINTS.includes(`left${j}`), `${id} ${j}`);
    }
  }
});

await check('it names the body part that is out of frame', () => {
  const squat = POSE_NEEDS.squat;
  assert.deepEqual(missingParts(fullPose(), squat), []);
  assert.deepEqual(missingParts(null, squat), ['body']);
  assert.deepEqual(missingParts(fullPose({ leftAnkle: 0.1, rightAnkle: 0.2 }), squat), ['legs']);
  assert.deepEqual(
    missingParts(fullPose({ leftShoulder: 0, rightShoulder: 0, leftKnee: 0, rightKnee: 0 }), squat),
    ['shoulders', 'legs'],
  );
  // Side-on, one whole side is enough.
  assert.deepEqual(missingParts(fullPose({ rightHip: 0, rightKnee: 0, rightAnkle: 0 }), squat), []);
  // Front-on exercises need both arms.
  assert.deepEqual(missingParts(fullPose({ rightWrist: 0.3 }), POSE_NEEDS.lateralraise), ['arms']);
  // A joint the model placed at no coordinates is not seen, whatever its score.
  const nan = fullPose();
  nan.leftAnkle = { x: NaN, y: 0.5, score: 1 };
  nan.rightAnkle = null;
  assert.deepEqual(missingParts(nan, squat), ['legs']);
});

await check('the gate opens after a second in view, not before', () => {
  const gate = createVisibilityGate(POSE_NEEDS.pushup);
  let r = gate.push(fullPose(), 0);
  assert.equal(r.ready, false);
  assert.equal(r.visible, true);
  r = gate.push(fullPose(), 500);
  assert.equal(r.progress, 0.5);
  assert.equal(r.ready, false);
  r = gate.push(fullPose(), 1000);
  assert.equal(r.ready, true);
  assert.equal(gate.ready, true);
});

await check('stepping out restarts the second; one dropped frame does not', () => {
  const gate = createVisibilityGate(POSE_NEEDS.squat);
  const out = fullPose({ leftAnkle: 0, rightAnkle: 0 });
  gate.push(fullPose(), 0);
  gate.push(out, 600); // a single bad frame
  assert.equal(gate.push(fullPose(), 700).progress, 0.7);
  gate.push(out, 800);
  gate.push(out, 1100); // gone for longer than the grace
  assert.equal(gate.push(fullPose(), 1200).progress, 0);
  assert.equal(gate.push(fullPose(), 2100).ready, false);
  assert.equal(gate.push(fullPose(), 2200).ready, true);
});

await check('once open it stays open, until reset', () => {
  const gate = createVisibilityGate(POSE_NEEDS.situp);
  gate.push(fullPose(), 0);
  gate.push(fullPose(), 1000);
  const r = gate.push(null, 1100);
  assert.equal(r.ready, true);
  assert.deepEqual(r.missing, ['body']);
  gate.reset();
  assert.equal(gate.push(fullPose(), 1200).ready, false);
});

await check('low-confidence joints keep it shut', () => {
  const gate = createExerciseGate('pushup');
  const shaky = fullPose(Object.fromEntries(JOINTS.map((j) => [j, 0.5])));
  for (let t = 0; t <= 3000; t += 33) assert.equal(gate.push(shaky, t).ready, false);
});

await check('every exercise opens on a full body and stays shut on an empty frame', () => {
  for (const id of POSE_EXERCISE_IDS) {
    const open = createExerciseGate(id);
    const shut = createExerciseGate(id);
    let ready = false;
    let never = false;
    for (let t = 0; t <= 1200; t += 33) {
      ready = open.push(fullPose(), t).ready;
      never = never || shut.push(null, t).ready;
    }
    assert.equal(ready, true, id);
    assert.equal(never, false, id);
  }
});

await check('the published pose page runs the gate and says so', () => {
  const page = readFileSync(path.join(root, 'docs', 'pose.html'), 'utf8');
  assert.match(page, /const PAGE_PROTOCOL_VERSION = 3;/);
  assert.match(page, /gate = createExerciseGate\(PAGE_EXERCISE\)/);
  assert.match(page, /type: 'visibility'/);
  assert.match(page, /gate: true/);
});

// --- camera setup card ----------------------------------------------------------------
group('camera setup card');

await check('every exercise has a placement, and words for it in both languages', () => {
  for (const e of exercises.EXERCISES) {
    const s = setup.cameraSetupFor(e.id);
    assert.equal(s.view, e.view, e.id);
    assert.ok(['floor', 'stand', 'seat'].includes(s.posture), e.id);
    assert.ok(['floor', 'knee', 'waist'].includes(s.height), e.id);
    assert.ok(s.distance >= 1.5 && s.distance <= 3.5, e.id);
    for (const lang of ['en', 'vi']) {
      assert.ok(STRINGS[lang][`setup.view.${s.view}`], `${lang} ${s.view}`);
      assert.ok(STRINGS[lang][`setup.height.${s.height}`], `${lang} ${s.height}`);
    }
  }
  assert.equal(setup.cameraSetupFor('pushup').posture, 'floor');
  assert.equal(setup.cameraSetupFor('squat').posture, 'stand');
});

await check('every message the new features can show exists in both languages', () => {
  const keys = [
    ...pose.BODY_PARTS_ORDER.map((p) => `vis.part.${p}`),
    ...['empty', 'tooLarge', 'json', 'format', 'version', 'data'].map((e) => `backup.error.${e}`),
    ...['win', 'lose', 'draw'].flatMap((o) => [`challenge.outcome.${o}`, `challenge.short.${o}`]),
  ];
  for (const lang of ['en', 'vi']) for (const key of keys) assert.ok(STRINGS[lang][key], `${lang} ${key}`);
});

console.log(`\n${state.passed} passed, ${state.failed} failed`);
process.exit(state.failed === 0 ? 0 : 1);
