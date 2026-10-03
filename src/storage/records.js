import AsyncStorage from '@react-native-async-storage/async-storage';

import { STORAGE_KEYS } from './sessions';

/**
 * Small lists of records the newer features keep: challenges sent and
 * received, and miscount reports. Each is a JSON array, newest first, of
 * objects with a string `id` and a numeric `at`, capped in length.
 */
const LIMITS = {
  [STORAGE_KEYS.challenges]: 100,
  [STORAGE_KEYS.miscounts]: 50,
};

const valid = (item) => item && typeof item === 'object' && typeof item.id === 'string' && Number.isFinite(item.at);

async function loadList(key) {
  try {
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(valid) : [];
  } catch {
    return [];
  }
}

/** Insert or replace `item` by id, keep the list newest first, and return it. */
async function upsert(key, item) {
  const list = await loadList(key);
  const next = [item, ...list.filter((x) => x.id !== item.id)]
    .sort((a, b) => b.at - a.at)
    .slice(0, LIMITS[key] ?? 50);
  try {
    await AsyncStorage.setItem(key, JSON.stringify(next));
  } catch {
    /* non-fatal: the record is still in memory for this run */
  }
  return next;
}

export const loadChallenges = () => loadList(STORAGE_KEYS.challenges);
export const saveChallenge = (record) => upsert(STORAGE_KEYS.challenges, record);
export const loadMiscounts = () => loadList(STORAGE_KEYS.miscounts);
export const saveMiscount = (report) => upsert(STORAGE_KEYS.miscounts, report);
