import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSIONS_KEY = 'pupg:sessions:v1';
const SETTINGS_KEY = 'pupg:settings:v1';
const PROGRAM_KEY = 'pupg:program:v1';

/** Sessions are stored newest-first, so reads and prepends are both O(1)-ish. */

function isValidSession(value) {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    Number.isFinite(value.timestamp) &&
    Number.isFinite(value.totalReps) &&
    Number.isFinite(value.durationSeconds)
  );
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
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidSession).sort((a, b) => b.timestamp - a.timestamp);
  } catch {
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
 */
export async function saveSession({
  totalReps,
  durationSeconds,
  timestamp = Date.now(),
  sourceId,
  sets,
  restSeconds,
  program,
}) {
  const session = {
    id: createSessionId(),
    timestamp,
    totalReps: Math.max(0, Math.round(totalReps)),
    durationSeconds: Math.max(0, Math.round(durationSeconds)),
    sourceId: sourceId ?? null,
  };
  const cleaned = cleanSets(sets);
  if (cleaned.length > 1) session.sets = cleaned;
  if (Number.isFinite(restSeconds) && restSeconds > 0) {
    session.restSeconds = Math.round(restSeconds);
  }
  if (program && Number.isFinite(program.day)) {
    session.program = { level: program.level, day: program.day };
  }
  const existing = await loadSessions();
  const next = [session, ...existing];
  await writeSessions(next);
  return { session, sessions: next };
}

export async function deleteSession(id) {
  const existing = await loadSessions();
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
  countdownSeconds: 5,
  restSeconds: 60,
  dailyGoal: 50,
  language: 'auto', // 'auto' | 'en' | 'vi'
  reminderEnabled: false,
  reminderHour: 19,
  reminderMinute: 0,
  onboardingDone: false,
};

export async function loadSettings() {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
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

/** Everything the app stores, for "delete all data". */
export async function clearAllData() {
  await AsyncStorage.multiRemove([SESSIONS_KEY, SETTINGS_KEY, PROGRAM_KEY]);
}
