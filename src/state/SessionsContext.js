import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { unlockedAchievements } from '../achievements/achievements';
import { isHoldSession } from '../exercises/exercises';
import { useDayKey } from '../hooks/useDayKey';
import { addEarnedRun, countCompleted, normalizeLevel, programDayKey } from '../program/program';
import {
  clearAllData,
  deleteSession,
  loadProgram,
  loadSchedule,
  loadScheduleEarned,
  loadSessions,
  saveSchedule,
  saveScheduleEarned,
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
  // Badge counts of schedule runs that were restarted or levelled up from.
  const [scheduleEarned, setScheduleEarned] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const readStored = useCallback(async () => {
    const [loadedSessions, loadedProgram, loadedSchedule, loadedEarned] = await Promise.all([
      loadSessions(),
      loadProgram(),
      loadSchedule(),
      loadScheduleEarned(),
    ]);
    return { loadedSessions, loadedProgram, loadedSchedule, loadedEarned };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { loadedSessions, loadedProgram, loadedSchedule, loadedEarned } = await readStored();
      if (cancelled) return;
      setSessions(loadedSessions);
      setProgram(loadedProgram);
      setSchedule(loadedSchedule);
      setScheduleEarned(loadedEarned);
      earnedRef.current = loadedEarned;
      setIsLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [readStored]);

  /** Read everything again, after a backup was restored underneath us. */
  const reload = useCallback(async () => {
    const { loadedSessions, loadedProgram, loadedSchedule, loadedEarned } = await readStored();
    scheduleRef.current = loadedSchedule;
    earnedRef.current = loadedEarned;
    setSessions(loadedSessions);
    setProgram(loadedProgram);
    setSchedule(loadedSchedule);
    setScheduleEarned(loadedEarned);
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
  const earnedRef = useRef(null);

  /**
   * The run in progress is about to be dropped (restart, next level): keep
   * the badges it earned. A run with no day done earned nothing to keep.
   */
  const keepEarned = useCallback(async (prev) => {
    if (!prev || countCompleted(prev.completed) === 0) return;
    const next = addEarnedRun(earnedRef.current, prev.completed);
    earnedRef.current = next;
    setScheduleEarned(next);
    await saveScheduleEarned(next);
  }, []);

  /**
   * Start (or restart, or change the level of) the training schedule. With
   * `slots` (a placement test's result) those are where each exercise starts;
   * otherwise a kept run keeps its own and a new one starts from the level.
   */
  const startSchedule = useCallback(async (level, { keepProgress = false, slots, tested } = {}) => {
    const prev = scheduleRef.current;
    const next = {
      level: normalizeLevel(level),
      startedAt: keepProgress && prev ? prev.startedAt : Date.now(),
      completed: keepProgress && prev ? prev.completed : {},
      slots: slots ?? (keepProgress && prev ? prev.slots ?? null : null),
      cycle: keepProgress && prev ? prev.cycle ?? 1 : 1,
      tested: tested ?? (keepProgress && prev ? prev.tested ?? null : null),
    };
    // Swapped in before anything is awaited, so a second tap (Next level
    // twice) finds the new run and cannot keep the old one's badges twice.
    scheduleRef.current = next;
    setSchedule(next);
    if (!keepProgress) await keepEarned(prev);
    await saveSchedule(next);
    return next;
  }, [keepEarned]);

  /**
   * The next cycle of the schedule: the slots carry on from where they are
   * (strength is not lost between cycles), the days start over, and the first
   * week is a lighter one.
   */
  const startNextCycle = useCallback(async ({ slots, level, tested } = {}) => {
    const prev = scheduleRef.current;
    if (!prev) return null;
    const next = {
      level: normalizeLevel(level ?? prev.level),
      startedAt: Date.now(),
      completed: {},
      slots: slots ?? prev.slots ?? null,
      cycle: (prev.cycle ?? 1) + 1,
      tested: tested ?? prev.tested ?? null,
    };
    scheduleRef.current = next;
    setSchedule(next);
    await keepEarned(prev);
    await saveSchedule(next);
    return next;
  }, [keepEarned]);

  /**
   * A schedule day's results: the day marked done when it was finished, and
   * the slots moved on by what was counted — even on a day cut short, the
   * exercises that were done count.
   */
  const completeScheduleDay = useCallback(async (week, day, { slots, done = true } = {}) => {
    const prev = scheduleRef.current;
    if (!prev) return;
    const next = {
      ...prev,
      completed: done ? { ...prev.completed, [programDayKey(week, day)]: Date.now() } : prev.completed,
      slots: slots ?? prev.slots ?? null,
    };
    scheduleRef.current = next;
    setSchedule(next);
    await saveSchedule(next);
  }, []);

  const resetSchedule = useCallback(async () => {
    const prev = scheduleRef.current;
    scheduleRef.current = null;
    setSchedule(null);
    await keepEarned(prev);
    await saveSchedule(null);
  }, [keepEarned]);

  const eraseEverything = useCallback(async () => {
    await clearAllData();
    scheduleRef.current = null;
    earnedRef.current = null;
    setSessions([]);
    setProgram(null);
    setSchedule(null);
    setScheduleEarned(null);
  }, []);

  // `sessions` is replaced wholesale on every write, so identity is a sound
  // cache key — stats only recompute when the data really changed, or when
  // the day does: "today" and the streak move at midnight on their own.
  const today = useDayKey();
  const stats = useMemo(
    () => computeStats(sessions, Date.now(), STATS_OPTIONS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, today],
  );
  const completedDays = program?.completedDays;
  const scheduleCompleted = schedule?.completed;
  const achievements = useMemo(
    () => unlockedAchievements(sessions, completedDays || {}, scheduleCompleted || {}, scheduleEarned),
    [sessions, completedDays, scheduleCompleted, scheduleEarned],
  );

  const value = useMemo(
    () => ({
      sessions,
      stats,
      achievements,
      program,
      schedule,
      scheduleEarned,
      today,
      isLoaded,
      addSession,
      removeSession,
      startSchedule,
      startNextCycle,
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
      scheduleEarned,
      today,
      isLoaded,
      addSession,
      removeSession,
      startSchedule,
      startNextCycle,
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
