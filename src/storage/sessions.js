import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSIONS_KEY = 'pupg:sessions:v1';
const SETTINGS_KEY = 'pupg:settings:v1';
const PROGRAM_KEY = 'pupg:program:v1';
const SCHEDULE_KEY = 'pupg:schedule:v1';
const CHALLENGES_KEY = 'pupg:challenges:v1';
const MISCOUNTS_KEY = 'pupg:miscounts:v1';
const ERRORS_KEY = 'pupg:errors:v1';
const SCHEDULE_EARNED_KEY = 'pupg:earned:v1';
const UNREADABLE_KEY = 'pupg:unreadable:v1';

/**
 * Every AsyncStorage key the app owns. Other modules read and write the newer
 * ones (src/storage/records.js, src/diagnostics/errorLog.js) but take the
 * names from here, so "delete all data" and the backup can never miss one.
 */
export const STORAGE_KEYS = {
  sessions: SESSIONS_KEY,
  settings: SETTINGS_KEY,
  program: PROGRAM_KEY,
  schedule: SCHEDULE_KEY,
  challenges: CHALLENGES_KEY,
  miscounts: MISCOUNTS_KEY,
  errors: ERRORS_KEY,
  scheduleEarned: SCHEDULE_EARNED_KEY,
  unreadable: UNREADABLE_KEY,
};

/**
 * What a backup file carries: everything but the local error log, which
 * describes this phone and means nothing on another one, and the copy of an
 * unreadable history kept aside by `readSessionsForWrite`. The app blocker's
 * state lives natively (modules/app-blocker) and is not in AsyncStorage.
 */
export const BACKUP_KEYS = [
  SESSIONS_KEY,
  SETTINGS_KEY,
  PROGRAM_KEY,
  SCHEDULE_KEY,
  CHALLENGES_KEY,
  MISCOUNTS_KEY,
  SCHEDULE_EARNED_KEY,
];

/**
 * The exercise a session without `exerciseId` was. Spelled out rather than
 * imported from src/exercises/exercises.js: this module must stay loadable on
 * its own (the Node suite feeds it in as a single file), and the value can
 * never change anyway, since every record written before exercises existed
 * depends on it.
 */
const LEGACY_EXERCISE_ID = 'pushup';

/** Sessions are stored newest-first, so reads and prepends are both O(1)-ish. */

/** Latest instant a JS Date can hold; a timestamp past it reads as "Invalid Date". */
const MAX_TIME = 8.64e15;

export function isValidSession(value) {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    Number.isFinite(value.timestamp) &&
    value.timestamp > 0 &&
    value.timestamp <= MAX_TIME &&
    Number.isFinite(value.totalReps) &&
    value.totalReps >= 0 &&
    Number.isFinite(value.durationSeconds) &&
    value.durationSeconds >= 0
  );
}

/**
 * A valid session with its sets cleaned as `saveSession` writes them. Sets
 * only ever come from this app, but a backup file can be edited by hand, and
 * one `null` among them would throw in every tally on every launch.
 */
export function normalizeSession(session) {
  if (!('sets' in session)) return session;
  const { sets, ...rest } = session;
  const cleaned = cleanSets(sets);
  return cleaned.length > 1 ? { ...rest, sets: cleaned } : rest;
}

const newestFirst = (a, b) => b.timestamp - a.timestamp;

/** The stored list, checked record by record. */
function parseSessions(raw) {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('sessions are not a list');
  return parsed.filter(isValidSession).map(normalizeSession).sort(newestFirst);
}

export function createSessionId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Read all sessions. Corrupt or partially-written data resolves to an empty
 * list rather than throwing: a bad record must never brick the app on launch.
 */
export async function loadSessions() {
  try {
    const raw = await AsyncStorage.getItem(SESSIONS_KEY);
    return raw ? parseSessions(raw) : [];
  } catch {
    return [];
  }
}

/**
 * The list a write builds on. Unlike `loadSessions`, a failed read throws:
 * writing `[newSession]` over a history that could not be read this once
 * would destroy it for good. A value that reads but does not parse is copied
 * aside before the list starts again, so nothing is ever thrown away.
 */
async function readSessionsForWrite() {
  const raw = await AsyncStorage.getItem(SESSIONS_KEY);
  if (!raw) return [];
  try {
    return parseSessions(raw);
  } catch {
    await AsyncStorage.setItem(UNREADABLE_KEY, raw);
    return [];
  }
}

async function writeSessions(sessions) {
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

/**
 * Sets as stored: rounded, and without empties. A user who pressed Done
 * without moving did not do a set of zero, and it must not drag averages down.
 */
export function cleanSets(sets) {
  if (!Array.isArray(sets)) return [];
  return sets
    .map((s) => ({
      reps: Math.max(0, Math.round(s?.reps || 0)),
      durationSeconds: Math.max(0, Math.round(s?.durationSeconds || 0)),
    }))
    .filter((s) => s.reps > 0);
}

/**
 * Persist one finished session and return the new full list, so callers update
 * state from what was actually written instead of guessing.
 *
 * `sets` is optional. A single-set workout is stored without it, exactly as
 * the first version stored everything, so old and new records share a shape
 * and every reader treats a missing `sets` as one set of `totalReps`.
 *
 * `exerciseId` follows the same rule: a push-up session is stored without it,
 * as every session was before there were other exercises, and readers treat
 * a missing one as a push-up (`exerciseOf`). Any other id is stored as given:
 * which exercises exist is src/exercises/exercises.js's business, and it
 * reads an id it does not know as a push-up as well.
 *
 * `workoutId` ties together the sessions one workout saved, one per exercise
 * (a schedule day of six exercises is six sessions, but one workout). Only
 * those carry it; any other session is a workout of its own.
 */
export async function saveSession({
  totalReps,
  durationSeconds,
  timestamp = Date.now(),
  sourceId,
  exerciseId,
  sets,
  restSeconds,
  program,
  workoutId,
}) {
  const session = {
    id: createSessionId(),
    timestamp,
    totalReps: Math.max(0, Math.round(totalReps)),
    durationSeconds: Math.max(0, Math.round(durationSeconds)),
    sourceId: sourceId ?? null,
  };
  if (typeof exerciseId === 'string' && exerciseId && exerciseId !== LEGACY_EXERCISE_ID) {
    session.exerciseId = exerciseId;
  }
  const cleaned = cleanSets(sets);
  if (cleaned.length > 1) session.sets = cleaned;
  if (Number.isFinite(restSeconds) && restSeconds > 0) {
    session.restSeconds = Math.round(restSeconds);
  }
  if (program && Number.isFinite(program.day)) {
    // Schedule days carry their week; the old push-up program's never did.
    session.program = Number.isFinite(program.week)
      ? { level: program.level, week: program.week, day: program.day }
      : { level: program.level, day: program.day };
  }
  if (typeof workoutId === 'string' && workoutId) session.workoutId = workoutId;
  const existing = await readSessionsForWrite();
  const next = [session, ...existing];
  await writeSessions(next);
  return { session, sessions: next };
}

export async function deleteSession(id) {
  const existing = await readSessionsForWrite();
  const next = existing.filter((s) => s.id !== id);
  await writeSessions(next);
  return next;
}

export async function clearSessions() {
  await AsyncStorage.removeItem(SESSIONS_KEY);
  return [];
}

export const DEFAULT_SETTINGS = {
  sourceId: null, // null => auto-detect the best available source
  soundEnabled: true,
  hapticsEnabled: true,
  voiceEnabled: true,
  coachVoiceEnabled: true, // say form mistakes the camera sees out loud
  countdownSeconds: 5,
  restSeconds: 60,
  dailyGoal: 50,
  language: 'auto', // 'auto' | 'en' | 'vi'
  reminderEnabled: false,
  reminderHour: 19,
  reminderMinute: 0,
  onboardingDone: false,
  blockerSecondsPerRep: 60, // fun time each rep earns; the blocker itself lives natively
  blockerSites: [], // websites the user added; the blocked apps' own sites are added on top
  exerciseId: LEGACY_EXERCISE_ID, // the exercise the workout screen opens on
  // Source picked per exercise, { [exerciseId]: sourceId }: the light sensor
  // suits push-ups and the motion sensor squats, so one choice cannot serve
  // all. A push-up with no entry falls back to `sourceId` above, which is
  // where every version before this one kept it.
  sourceIds: {},
  // The name a challenge link shows a friend. null: never asked; '' asked and
  // left blank. It only leaves the phone inside a link the user shares.
  challengeName: null,
  // Exercises whose camera setup card has been seen ({ [exerciseId]: true }):
  // it opens by itself the first time, and on request after that.
  setupSeen: {},
};

const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * Stored settings merged onto the defaults. Flat values need nothing more,
 * but `sourceIds` is looked into (`sourceIds[exerciseId]`), so a corrupt one
 * (null, an array, a string) would throw or answer nonsense: it falls back to
 * `{}`, keeping only entries that can be a source (an id, or null for auto).
 * The `sourceIds` returned is always a new object, never the one in
 * DEFAULT_SETTINGS, so no caller can change the defaults through it.
 */
function mergeSettings(stored) {
  const merged = { ...DEFAULT_SETTINGS, ...(isPlainObject(stored) ? stored : {}) };
  const sourceIds = {};
  if (isPlainObject(merged.sourceIds)) {
    for (const [exerciseId, sourceId] of Object.entries(merged.sourceIds)) {
      if (typeof sourceId === 'string' || sourceId === null) sourceIds[exerciseId] = sourceId;
    }
  }
  if (typeof merged.exerciseId !== 'string' || !merged.exerciseId) {
    merged.exerciseId = DEFAULT_SETTINGS.exerciseId;
  }
  if (typeof merged.challengeName !== 'string') merged.challengeName = null;
  const setupSeen = {};
  if (isPlainObject(merged.setupSeen)) {
    for (const [exerciseId, seen] of Object.entries(merged.setupSeen)) {
      if (seen === true) setupSeen[exerciseId] = true;
    }
  }
  return { ...merged, sourceIds, setupSeen };
}

export async function loadSettings() {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    return mergeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return mergeSettings(null);
  }
}

export async function saveSettings(settings) {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* non-fatal: settings fall back to defaults next launch */
  }
}

/**
 * Progress in the old 6-week push-up program, which the training schedule
 * replaced. Still read, so the badges it earned are kept; nothing writes it
 * any more except to clear it.
 *
 * Program progress: the level the test assigned and which days are done.
 * `null` means no program has been started.
 *   { level, testReps, startedAt, completedDays: { [day]: timestamp } }
 */
export async function loadProgram() {
  try {
    const raw = await AsyncStorage.getItem(PROGRAM_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Number.isFinite(parsed.level)) return null;
    const completedDays = {};
    for (const [day, at] of Object.entries(parsed.completedDays || {})) {
      if (Number.isFinite(Number(day)) && Number.isFinite(at)) completedDays[Number(day)] = at;
    }
    return {
      level: parsed.level,
      testReps: Number.isFinite(parsed.testReps) ? parsed.testReps : null,
      startedAt: Number.isFinite(parsed.startedAt) ? parsed.startedAt : Date.now(),
      completedDays,
    };
  } catch {
    return null;
  }
}

export async function saveProgram(program) {
  try {
    if (!program) await AsyncStorage.removeItem(PROGRAM_KEY);
    else await AsyncStorage.setItem(PROGRAM_KEY, JSON.stringify(program));
  } catch {
    /* non-fatal: progress is re-derived from the in-memory copy next write */
  }
  return program;
}

/**
 * Training schedule progress (src/program/program.js): the level picked and
 * which days are done. `null` means no schedule has been started.
 *   { level, startedAt, completed: { [programDayKey]: timestamp } }
 */
export async function loadSchedule() {
  try {
    const raw = await AsyncStorage.getItem(SCHEDULE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed) || typeof parsed.level !== 'string') return null;
    const completed = {};
    for (const [key, at] of Object.entries(isPlainObject(parsed.completed) ? parsed.completed : {})) {
      if (/^\d+-\d+$/.test(key) && Number.isFinite(at)) completed[key] = at;
    }
    return {
      level: parsed.level,
      startedAt: Number.isFinite(parsed.startedAt) ? parsed.startedAt : Date.now(),
      completed,
    };
  } catch {
    return null;
  }
}

export async function saveSchedule(schedule) {
  try {
    if (!schedule) await AsyncStorage.removeItem(SCHEDULE_KEY);
    else await AsyncStorage.setItem(SCHEDULE_KEY, JSON.stringify(schedule));
  } catch {
    /* non-fatal: progress is re-derived from the in-memory copy next write */
  }
  return schedule;
}

/**
 * Program badges earned by schedule runs that were restarted or replaced by
 * the next level, so starting over never takes a badge away:
 *   { days, weeks, complete }  training days, full weeks and finished runs
 * `null` when no run has ended yet.
 */
export async function loadScheduleEarned() {
  try {
    const raw = await AsyncStorage.getItem(SCHEDULE_EARNED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) return null;
    const count = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
    return { days: count(parsed.days), weeks: count(parsed.weeks), complete: count(parsed.complete) };
  } catch {
    return null;
  }
}

export async function saveScheduleEarned(earned) {
  try {
    if (!earned) await AsyncStorage.removeItem(SCHEDULE_EARNED_KEY);
    else await AsyncStorage.setItem(SCHEDULE_EARNED_KEY, JSON.stringify(earned));
  } catch {
    /* non-fatal: the in-memory copy is written again with the next run */
  }
  return earned;
}

/** Everything the app stores, for "delete all data". */
export async function clearAllData() {
  await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
}
