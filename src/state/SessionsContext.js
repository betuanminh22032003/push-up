import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { unlockedAchievements } from '../achievements/achievements';
import { levelForTest } from '../program/program';
import {
  clearAllData,
  deleteSession,
  loadProgram,
  loadSessions,
  saveProgram,
  saveSession,
} from '../storage/sessions';
import { computeStats } from '../utils/stats';

const SessionsContext = createContext(null);

/**
 * Owns the persisted workout history and program progress, plus everything
 * derived from them (stats, achievements).
 *
 * Each mutation resolves to the list AsyncStorage actually holds and sets
 * state from that, so the UI can never drift from disk.
 */
export function SessionsProvider({ children }) {
  const [sessions, setSessions] = useState([]);
  const [program, setProgram] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [loadedSessions, loadedProgram] = await Promise.all([loadSessions(), loadProgram()]);
      if (cancelled) return;
      setSessions(loadedSessions);
      setProgram(loadedProgram);
      setIsLoaded(true);
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

  /** Start (or restart) the program from a max-test result. */
  const startProgram = useCallback(async (testReps) => {
    const next = {
      level: levelForTest(testReps),
      testReps,
      startedAt: Date.now(),
      completedDays: {},
    };
    setProgram(next);
    await saveProgram(next);
    return next;
  }, []);

  // Mirrors `program` so a write can be computed synchronously: a functional
  // setState updater runs lazily at the next render, too late to persist from.
  const programRef = useRef(program);
  useEffect(() => {
    programRef.current = program;
  }, [program]);

  const completeProgramDay = useCallback(async (day) => {
    const prev = programRef.current;
    if (!prev) return;
    const next = { ...prev, completedDays: { ...prev.completedDays, [day]: Date.now() } };
    programRef.current = next;
    setProgram(next);
    await saveProgram(next);
  }, []);

  const resetProgram = useCallback(async () => {
    setProgram(null);
    await saveProgram(null);
  }, []);

  const eraseEverything = useCallback(async () => {
    await clearAllData();
    setSessions([]);
    setProgram(null);
  }, []);

  // `sessions` is replaced wholesale on every write, so identity is a sound
  // cache key — stats only recompute when the data really changed.
  const stats = useMemo(() => computeStats(sessions), [sessions]);
  const completedDays = program?.completedDays;
  const achievements = useMemo(
    () => unlockedAchievements(sessions, completedDays || {}),
    [sessions, completedDays],
  );

  const value = useMemo(
    () => ({
      sessions,
      stats,
      achievements,
      program,
      isLoaded,
      addSession,
      removeSession,
      startProgram,
      completeProgramDay,
      resetProgram,
      eraseEverything,
    }),
    [
      sessions,
      stats,
      achievements,
      program,
      isLoaded,
      addSession,
      removeSession,
      startProgram,
      completeProgramDay,
      resetProgram,
      eraseEverything,
    ],
  );
  return <SessionsContext.Provider value={value}>{children}</SessionsContext.Provider>;
}

export function useSessions() {
  const ctx = useContext(SessionsContext);
  if (!ctx) throw new Error('useSessions must be used inside SessionsProvider');
  return ctx;
}
