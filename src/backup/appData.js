import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { BACKUP_KEYS, STORAGE_KEYS, isValidSession, normalizeSession } from '../storage/sessions';
import { computeStats, countWorkouts } from '../utils/stats';
import { buildBackup, parseBackup, planRestore, summarizeBackup } from './backup';

/** Lists of records merged by id on a restore, with the field they sort by. */
const LIST_KEYS = {
  [STORAGE_KEYS.sessions]: 'timestamp',
  [STORAGE_KEYS.challenges]: 'at',
  [STORAGE_KEYS.miscounts]: 'at',
};

/** The backup file's text: every key the app owns but the error log. */
export async function exportAppData({ appVersion } = {}) {
  const pairs = await AsyncStorage.multiGet(BACKUP_KEYS);
  const backup = buildBackup(Object.fromEntries(pairs), { appVersion, platform: Platform.OS });
  return JSON.stringify(backup, null, 1);
}

/**
 * Check a picked file and describe it for the preview.
 * @returns {{ok: true, backup, summary, dropped} | {ok: false, error}}
 */
export function readBackup(text) {
  const result = parseBackup(text, {
    keys: BACKUP_KEYS,
    sessionsKey: STORAGE_KEYS.sessions,
    isValidSession,
    normalizeSession,
  });
  if (!result.ok) return result;
  const summary = summarizeBackup(result.backup, {
    sessionsKey: STORAGE_KEYS.sessions,
    streakOf: (sessions, at) => computeStats(sessions, at).streak,
    workoutsOf: countWorkouts,
  });
  return { ...result, summary };
}

/**
 * Write a checked backup over (replace) or into (merge) what is stored. The
 * caller reloads the app's state from storage afterwards.
 * @returns {{ added: object, addedWorkouts: number }}  for a merge, records
 *   added per list key, and how many workouts the added sessions make
 */
export async function restoreAppData(backup, mode) {
  const pairs = await AsyncStorage.multiGet(BACKUP_KEYS);
  const current = {};
  for (const [key, raw] of pairs) {
    try {
      current[key] = raw == null ? null : JSON.parse(raw);
    } catch {
      current[key] = null;
    }
  }
  const { writes, added } = planRestore(backup, current, mode, { keys: BACKUP_KEYS, listKeys: LIST_KEYS });
  const sets = [];
  const removes = [];
  for (const [key, value] of Object.entries(writes)) {
    if (value == null) removes.push(key);
    else sets.push([key, JSON.stringify(value)]);
  }
  if (sets.length) await AsyncStorage.multiSet(sets);
  if (removes.length) await AsyncStorage.multiRemove(removes);
  const sessionsKey = STORAGE_KEYS.sessions;
  const before = Array.isArray(current[sessionsKey]) ? current[sessionsKey] : [];
  const after = Array.isArray(writes[sessionsKey]) ? writes[sessionsKey] : before;
  return { added, addedWorkouts: Math.max(0, countWorkouts(after) - countWorkouts(before)) };
}
