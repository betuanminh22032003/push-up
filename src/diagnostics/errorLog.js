import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A crash log that never leaves the phone on its own.
 *
 * The last few JavaScript errors are kept in AsyncStorage, newest first. No
 * crash-reporting SDK, no network: they only go anywhere inside a feedback
 * or miscount report the user reads and shares through the share sheet
 * (src/diagnostics/report.js). The key matches STORAGE_KEYS.errors in
 * src/storage/sessions.js, which "delete all data" clears; spelled out here
 * so this file stays loadable on its own.
 */
export const ERROR_LOG_KEY = 'pupg:errors:v1';
export const ERROR_LOG_LIMIT = 20;

/** Long enough to place an error; a whole minified stack is not. */
const MESSAGE_MAX = 300;
const STACK_MAX = 1200;

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * One log entry from whatever was thrown: an Error, a string, anything.
 * @param {*} error
 * @param {object} meta  { fatal, source: 'global'|'boundary'|'promise'|..., now }
 */
export function normalizeError(error, { fatal = false, source = 'global', now = Date.now() } = {}) {
  let message;
  let stack = '';
  if (error instanceof Error) {
    message = `${error.name || 'Error'}: ${error.message}`;
    stack = typeof error.stack === 'string' ? error.stack : '';
  } else if (typeof error === 'string') {
    message = error;
  } else if (error == null) {
    message = '';
  } else {
    try {
      message = JSON.stringify(error) ?? String(error);
    } catch {
      message = String(error);
    }
  }
  return {
    at: now,
    message: clip(String(message || 'Unknown error'), MESSAGE_MAX),
    stack: clip(stack, STACK_MAX),
    fatal: !!fatal,
    source,
  };
}

/**
 * The log with `entry` added: newest first, at most `limit` long. The same
 * error repeating (a render loop throwing every frame) is one entry with a
 * count, so it cannot push every other error out.
 */
export function appendError(log, entry, limit = ERROR_LOG_LIMIT) {
  const list = Array.isArray(log) ? log.filter((e) => e && typeof e.message === 'string') : [];
  const last = list[0];
  if (last && last.message === entry.message && last.source === entry.source) {
    return [{ ...last, at: entry.at, fatal: last.fatal || entry.fatal, count: (last.count || 1) + 1 }, ...list.slice(1)];
  }
  return [entry, ...list].slice(0, limit);
}

export async function loadErrors() {
  try {
    const raw = await AsyncStorage.getItem(ERROR_LOG_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((e) => e && typeof e.message === 'string') : [];
  } catch {
    return [];
  }
}

// Writes are chained so two errors in quick succession cannot both read the
// old log and have one overwrite the other.
let queue = Promise.resolve();

/** Keep an error. Never throws: the logger failing must not cause the next error. */
export function recordError(error, meta) {
  const entry = normalizeError(error, meta);
  queue = queue
    .then(async () => {
      const next = appendError(await loadErrors(), entry);
      await AsyncStorage.setItem(ERROR_LOG_KEY, JSON.stringify(next));
    })
    .catch(() => {});
  return queue;
}

export async function clearErrors() {
  try {
    await AsyncStorage.removeItem(ERROR_LOG_KEY);
  } catch {
    /* nothing to clear */
  }
}
