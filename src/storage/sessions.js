import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSIONS_KEY = 'pupg:sessions:v1';
const SETTINGS_KEY = 'pupg:settings:v1';

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
 * Persist one finished session and return the new full list, so callers update
 * state from what was actually written instead of guessing.
 */
export async function saveSession({ totalReps, durationSeconds, timestamp = Date.now(), sourceId }) {
  const session = {
    id: createSessionId(),
    timestamp,
    totalReps: Math.max(0, Math.round(totalReps)),
    durationSeconds: Math.max(0, Math.round(durationSeconds)),
    sourceId: sourceId ?? null,
  };
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

const DEFAULT_SETTINGS = {
  sourceId: null, // null => auto-detect the best available source
  soundEnabled: true,
  hapticsEnabled: true,
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
