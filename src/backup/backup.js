/**
 * Backup files: what goes in one, how one is checked on the way back in, and
 * how its contents meet the data already on the phone.
 *
 * Pure functions, no imports: the storage keys and the session check come in
 * as arguments (from src/storage/sessions.js), so the Node suite runs this
 * file as is. Reading and writing AsyncStorage and the file itself is
 * ./appData.js and ./files.js.
 *
 * A backup is one JSON object:
 *   { format: 'hitdat-backup', version: 1, exportedAt: ISO date,
 *     app: { version, platform }, data: { [storageKey]: stored value } }
 *
 * `data` holds each key's value parsed, not as the string AsyncStorage keeps,
 * so the file is readable and a hand-edited one still parses.
 */

export const BACKUP_FORMAT = 'hitdat-backup';
export const BACKUP_VERSION = 1;

/** Larger than any real history (a session a day for decades); refuses a runaway file. */
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * The backup object for what AsyncStorage holds.
 * @param {object} entries  { [key]: raw string from AsyncStorage, or null }
 * @param {object} meta     { appVersion, platform, now }
 */
export function buildBackup(entries, { appVersion = null, platform = null, now = Date.now() } = {}) {
  const data = {};
  for (const [key, raw] of Object.entries(entries || {})) {
    if (raw == null) continue;
    try {
      data[key] = JSON.parse(raw);
    } catch {
      // A value that does not parse is no use to a restore either.
    }
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date(now).toISOString(),
    app: { version: appVersion, platform },
    data,
  };
}

/** hitdat-backup-2026-10-03.json, in local time. */
export function backupFileName(now = Date.now()) {
  const d = new Date(now);
  const pad = (n) => String(n).padStart(2, '0');
  return `hitdat-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

/**
 * Check a file's text and keep what can be restored.
 *
 * @param {string} text
 * @param {object} options
 *   keys            storage keys a backup may carry; anything else is dropped
 *   sessionsKey     the key holding the workout history
 *   isValidSession  the storage layer's own record check
 * @returns {{ok: true, backup: object, dropped: number} | {ok: false, error: string}}
 *   error is one of 'empty', 'tooLarge', 'json', 'format', 'version', 'data'
 */
export function parseBackup(text, { keys, sessionsKey, isValidSession }) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'empty' };
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, error: 'tooLarge' };

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'json' };
  }
  if (!isPlainObject(parsed) || parsed.format !== BACKUP_FORMAT) return { ok: false, error: 'format' };
  // A newer app's file may hold things this version would mangle.
  if (!Number.isInteger(parsed.version) || parsed.version < 1 || parsed.version > BACKUP_VERSION) {
    return { ok: false, error: 'version' };
  }
  if (!isPlainObject(parsed.data)) return { ok: false, error: 'data' };

  const data = {};
  let dropped = 0;
  for (const key of keys) {
    if (!(key in parsed.data)) continue;
    const value = parsed.data[key];
    if (key === sessionsKey) {
      if (!Array.isArray(value)) return { ok: false, error: 'data' };
      const valid = value.filter((s) => isValidSession(s));
      dropped += value.length - valid.length;
      data[key] = valid;
    } else if (value !== null && typeof value === 'object') {
      // Everything else is an object or a list the storage layer re-checks
      // field by field when it loads it, as it does for its own writes.
      data[key] = value;
    } else {
      dropped += 1;
    }
  }

  return {
    ok: true,
    backup: {
      format: BACKUP_FORMAT,
      version: parsed.version,
      exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : null,
      app: isPlainObject(parsed.app) ? parsed.app : {},
      data,
    },
    dropped,
  };
}

/**
 * What the import preview shows.
 * @param {object} backup        from parseBackup
 * @param {object} options
 *   sessionsKey
 *   streakOf     (sessions) => streak in days, as of the backup's last day
 * @returns {{ sessions, totalReps, firstAt, lastAt, exportedAt, streak, keys }}
 */
export function summarizeBackup(backup, { sessionsKey, streakOf }) {
  const sessions = backup.data[sessionsKey] || [];
  let firstAt = null;
  let lastAt = null;
  let totalReps = 0;
  for (const s of sessions) {
    if (firstAt === null || s.timestamp < firstAt) firstAt = s.timestamp;
    if (lastAt === null || s.timestamp > lastAt) lastAt = s.timestamp;
    totalReps += s.totalReps;
  }
  return {
    sessions: sessions.length,
    totalReps,
    firstAt,
    lastAt,
    exportedAt: backup.exportedAt,
    // The streak the history ended on: measured at its last day, since a
    // backup restored a month later would otherwise always read zero.
    streak: sessions.length && streakOf ? streakOf(sessions, lastAt) : 0,
    keys: Object.keys(backup.data),
  };
}

/**
 * Two lists of records with string ids, joined: what is here stays as it is,
 * and what only the backup has is added. Newest first by `timestampField`.
 */
export function mergeById(current, incoming, timestampField = 'timestamp') {
  const byId = new Map();
  for (const item of Array.isArray(current) ? current : []) {
    if (item && typeof item.id === 'string') byId.set(item.id, item);
  }
  let added = 0;
  for (const item of Array.isArray(incoming) ? incoming : []) {
    if (!item || typeof item.id !== 'string' || byId.has(item.id)) continue;
    byId.set(item.id, item);
    added += 1;
  }
  const list = [...byId.values()].sort(
    (a, b) => (Number(b[timestampField]) || 0) - (Number(a[timestampField]) || 0),
  );
  return { list, added };
}

/**
 * What to write for a restore: { [key]: value } where null means remove.
 *
 * 'replace' makes the phone hold exactly what the backup holds; a key the
 * backup lacks is cleared. 'merge' adds the backup's sessions (and other
 * lists of records) that are not already here, matched by id, and only takes
 * its settings and schedule progress where the phone has none.
 *
 * @param {object} backup    from parseBackup
 * @param {object} current   { [key]: parsed value or null } as stored now
 * @param {'replace'|'merge'} mode
 * @param {object} options   { keys, listKeys: { [key]: timestamp field } }
 * @returns {{ writes: object, added: object }}  added: { [listKey]: records added by a merge }
 */
export function planRestore(backup, current, mode, { keys, listKeys }) {
  const writes = {};
  const added = {};
  for (const key of keys) {
    const incoming = key in backup.data ? backup.data[key] : null;
    const here = current?.[key] ?? null;
    if (mode === 'replace') {
      writes[key] = incoming;
    } else if (key in listKeys) {
      if (incoming == null) continue;
      const merged = mergeById(here, incoming, listKeys[key]);
      added[key] = merged.added;
      writes[key] = merged.list;
    } else if (here == null && incoming != null) {
      writes[key] = incoming;
    }
  }
  return { writes, added };
}
