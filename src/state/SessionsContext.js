import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { unlockedAchievements } from '../achievements/achievements';
import { isHoldSession } from '../exercises/exercises';
import { normalizeLevel, programDayKey } from '../program/program';
import {
  clearAllData,
  deleteSession,
  loadProgram,
  loadSchedule,
  loadSessions,
  saveSchedule,
  saveSession,
} from '../storage/sessions';
import { computeStats } from '../utils/stats';

const SessionsContext = createContext(null);

/** Stats count reps; a hold's seconds are kept out of them (src/utils/stats.js). */
const STATS_OPTIONS = { isHold: isHoldSession };

/**
 * Owns the persisted workout history and training-schedule progress, plus
 * everything derived from them (stats, achievements). The old push-up
 * program's progress (`program`) is only read, for the badges it earned.
 *
 * Each mutation resolves to the list AsyncStorage actually holds and sets
 * state from that, so the UI can never drift from disk.
 */
export function SessionsProvider({ children }) {
  const [sessions, setSessions] = useState([]);
  const [program, setProgram] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const readStored = useCallback(async () => {
    const [loadedSessions, loadedProgram, loadedSchedule] = await Promise.all([
      loadSessions(),
      loadProgram(),
      loadSchedule(),
    ]);
    return { loadedSessions, loadedProgram, loadedSchedule };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { loadedSessions, loadedProgram, loadedSchedule } = await readStored();
      if (cancelled) return;
      setSessions(loadedSessions);
      setProgram(loadedProgram);
      setSchedule(loadedSchedule);
      setIsLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [readStored]);

  /** Read everything again, after a backup was restored underneath us. */
  const reload = useCallback(async () => {
    const { loadedSessions, loadedProgram, loadedSchedule } = await readStored();
    scheduleRef.current = loadedSchedule;
    setSessions(loadedSessions);
    setProgram(loadedProgram);
    setSchedule(loadedSchedule);
  }, [readStored]);

  const addSession = useCallback(async (payload) => {
    const { session, sessions: next } = await saveSession(payload);
    setSessions(next);
    return session;
  }, []);

  const removeSession = useCallback(async (id) => {
    setSessions(await deleteSession(id));
  }, []);

  // Mirrors `schedule` so a write can be computed synchronously: a functional
  // setState updater runs lazily at the next render, too late to persist from.
  const scheduleRef = useRef(schedule);
  useEffect(() => {
    scheduleRef.current = schedule;
  }, [schedule]);

  /** Start (or restart, or change the level of) the training schedule. */
  const startSchedule = useCallback(async (level, { keepProgress = false } = {}) => {
    const prev = scheduleRef.current;
    const next = {
      level: normalizeLevel(level),
      startedAt: keepProgress && prev ? prev.startedAt : Date.now(),
      completed: keepProgress && prev ? prev.completed : {},
    };
    scheduleRef.current = next;
    setSchedule(next);
    await saveSchedule(next);
    return next;
  }, []);

  const completeScheduleDay = useCallback(async (week, day) => {
    const prev = scheduleRef.current;
    if (!prev) return;
    const next = { ...prev, completed: { ...prev.completed, [programDayKey(week, day)]: Date.now() } };
    scheduleRef.current = next;
    setSchedule(next);
    await saveSchedule(next);
  }, []);

  const resetSchedule = useCallback(async () => {
    scheduleRef.current = null;
    setSchedule(null);
    await saveSchedule(null);
  }, []);

  const eraseEverything = useCallback(async () => {
    await clearAllData();
    setSessions([]);
    setProgram(null);
    setSchedule(null);
  }, []);

  // `sessions` is replaced wholesale on every write, so identity is a sound
  // cache key — stats only recompute when the data really changed.
  const stats = useMemo(() => computeStats(sessions, Date.now(), STATS_OPTIONS), [sessions]);
  const completedDays = program?.completedDays;
  const scheduleCompleted = schedule?.completed;
  const achievements = useMemo(
    () => unlockedAchievements(sessions, completedDays || {}, scheduleCompleted || {}),
    [sessions, completedDays, scheduleCompleted],
  );

  const value = useMemo(
    () => ({
      sessions,
      stats,
      achievements,
      program,
      schedule,
      isLoaded,
      addSession,
      removeSession,
      startSchedule,
      completeScheduleDay,
      resetSchedule,
      eraseEverything,
      reload,
    }),
    [
      sessions,
      stats,
      achievements,
      program,
      schedule,
      isLoaded,
      addSession,
      removeSession,
      startSchedule,
      completeScheduleDay,
      resetSchedule,
      eraseEverything,
      reload,
    ],
  );
  return <SessionsContext.Provider value={value}>{children}</SessionsContext.Provider>;
}

export function useSessions() {
  const ctx = useContext(SessionsContext);
  if (!ctx) throw new Error('useSessions must be used inside SessionsProvider');
  return ctx;
}
