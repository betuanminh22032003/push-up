import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  clearSessions,
  deleteSession,
  loadSessions,
  saveSession,
} from '../storage/sessions';
import { computeStats } from '../utils/stats';

/**
 * Owns the persisted session list and everything derived from it.
 *
 * Each mutation resolves to the list AsyncStorage actually holds and sets state
 * from that, so the UI can never drift from disk.
 */
export function useSessions() {
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await loadSessions();
      if (cancelled) return;
      setSessions(loaded);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const addSession = useCallback(async (payload) => {
    const { session, sessions: next } = await saveSession(payload);
    setSessions(next);
    return session;
  }, []);

  const removeSession = useCallback(async (id) => {
    setSessions(await deleteSession(id));
  }, []);

  const removeAll = useCallback(async () => {
    setSessions(await clearSessions());
  }, []);

  // `sessions` is replaced wholesale on every write, so identity is a sound
  // cache key — stats only recompute when the data really changed.
  const stats = useMemo(() => computeStats(sessions), [sessions]);

  return { sessions, stats, isLoading, addSession, removeSession, removeAll };
}
