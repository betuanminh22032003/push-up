import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { newlyUnlocked, unlockedAchievements } from '../achievements/achievements';
import { creditFor, earnsTime, formatAmount, hasWayToBlock, isSetUp } from '../blocker/blockerLogic';
import { Button } from '../components/Button';
import { CameraSetupGuide } from '../components/CameraSetupGuide';
import { ExerciseGuideButton, ExerciseGuideSheet, GuideDock } from '../components/ExerciseGuide';
import { ExerciseLibraryButton } from '../components/ExerciseLibrary';
import { MiscountModal } from '../components/MiscountModal';
import { StatTile } from '../components/StatTile';
import { VisibilityPill } from '../components/VisibilityPill';
import {
  DEFAULT_EXERCISE_ID,
  EXERCISE_IDS,
  getExercise,
  isHold,
  supportsSource,
} from '../exercises/exercises';
import { programDayKey } from '../program/program';
import { useCountdown } from '../hooks/useCountdown';
import { useFeedback } from '../hooks/useFeedback';
import { useRepDetector } from '../hooks/useRepDetector';
import { useWorkoutTimer } from '../hooks/useWorkoutTimer';
import { useI18n } from '../i18n/I18nContext';
import { STRINGS } from '../i18n/strings';
import { PoseStage } from '../pose/PoseStage';
import { ISSUES } from '../pose/analyzers';
import { SOURCES, getSourceById } from '../sensors/sources';
import { useBlocker } from '../state/BlockerContext';
import { useSessions } from '../state/SessionsContext';
import { useSettings } from '../state/SettingsContext';
import { colors, radius, spacing, type } from '../theme/theme';
import { confirm } from '../utils/confirm';
import { shareText } from '../utils/share';
import { formatDuration } from '../utils/time';

const KEEP_AWAKE_TAG = 'pupg-workout';

/** How often a cue that still stands is offered to the voice again (it spaces repeats itself). */
const CUE_REPEAT_CHECK_MS = 3000;

/** How long a coaching message stays up after the frame that produced it. */
const COACH_STICKY_MS = 2200;

/**
 * Translation key for what to tell the user when the analyser rejects a rep,
 * per exercise and issue. An exercise that words an issue its own way has a
 * `coach.<exercise>.<issue>` key ("shallow" is "Come up higher" for a sit-up,
 * "Go lower" for a push-up); every other issue uses the shared
 * `coach.<issue>`. Built once, so the per-frame lookup stays a property read.
 */
const COACH_KEYS = Object.fromEntries(
  EXERCISE_IDS.map((id) => [
    id,
    Object.fromEntries(
      Object.values(ISSUES).map((issue) => {
        const own = `coach.${id}.${issue}`;
        return [issue, own in STRINGS.en ? own : `coach.${issue}`];
      }),
    ),
  ]),
);

/**
 * Sources a schedule day may switch to between exercises. The light sensor
 * calibrates when a workout starts and the motion source needs the phone put
 * on the body, neither of which a mid-workout change of exercise allows.
 */
const PROGRAM_SOURCE_IDS = ['ai', 'tap', 'timer'];

/** A hold says its count only every this many seconds; every second is too much. */
const HOLD_SPEAK_EVERY = 10;

/**
 * Where set `index` sits in its exercise's run of sets: a schedule day is
 * every set of one exercise, then every set of the next.
 */
function setOfExercise(sets, index) {
  const id = sets[index].exerciseId;
  let first = index;
  while (first > 0 && sets[first - 1].exerciseId === id) first -= 1;
  let last = index;
  while (last < sets.length - 1 && sets[last + 1].exerciseId === id) last += 1;
  return { n: index - first + 1, total: last - first + 1 };
}

/** Consecutive sets of one exercise, as one saved session each. */
function groupByExercise(sets) {
  const groups = [];
  for (const set of sets) {
    const last = groups[groups.length - 1];
    if (last && last.exerciseId === set.exerciseId) last.sets.push(set);
    else groups.push({ exerciseId: set.exerciseId, sets: [set] });
  }
  return groups;
}

const STATUS_COLOR = {
  idle: colors.textDim,
  calibrating: colors.warn,
  countdown: colors.warn,
  active: colors.accent,
  paused: colors.warn,
  rest: colors.textDim,
};

/** Seconds from the end of a countdown at which each remaining second ticks. */
const TICK_FROM = 3;

function freshLive() {
  return { reps: 0, sets: [], restSeconds: 0, restStartedAt: null };
}

/**
 * The workout itself: idle -> [calibrating] -> countdown -> active <-> paused
 * -> rest -> countdown -> ... -> saved. With a source that has to be put back
 * in place (motion), paused -> active also goes through a countdown.
 *
 * A hold (plank, wall sit...) runs the same way: its "reps" are seconds held,
 * so a target of 30 ends the set at 30 seconds.
 *
 * @param {object|null} plan   what to do: null (free), or a schedule day,
 *                             { kind: 'program', level, week, day, restSeconds,
 *                             items, sets } where `sets` is planSets() from
 *                             src/program/program.js: every set in order, each
 *                             naming its exercise
 * @param {Function} onClearPlan     the plan was finished or dismissed
 * @param {Function} onStatusChange  so the shell can hide the tabs mid-set
 * @param {Function} onCelebrate     toasts for the goal and new achievements
 * @param {Function} onOpenBlocker   the fun-time chip leads to the blocker tab
 * @param {Function} onOpenChallenge (exerciseId) opens a new timed challenge
 * @param {object}   controlsRef     lets the shell pause on the back button
 */
export function WorkoutScreen({
  plan,
  onClearPlan,
  onStatusChange,
  onCelebrate,
  onOpenBlocker,
  onOpenChallenge,
  controlsRef,
}) {
  const { t, speechTag } = useI18n();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useSettings();
  const { state: blocker, rate: blockerRate, creditReps, serviceStalled } = useBlocker();
  const earning = earnsTime(blocker);
  // Set up, but no way to block is switched on, or it stopped: nothing is blocked.
  const blockerOff = isSetUp(blocker) && (!hasWayToBlock(blocker) || serviceStalled);
  const {
    sessions,
    stats,
    achievements,
    program,
    schedule,
    addSession,
    completeScheduleDay,
  } = useSessions();

  const [status, setStatus] = useState('idle');
  const [reps, setReps] = useState(0);
  const [completedSets, setCompletedSets] = useState([]);
  const [restOver, setRestOver] = useState(false);
  const [summary, setSummary] = useState(null);
  const [notice, setNotice] = useState(null);
  const [coach, setCoach] = useState(null);
  // A countdown that leads back into a paused set rather than into a new one.
  const [resuming, setResuming] = useState(false);
  // The camera's visibility gate: which body parts it is still waiting for.
  const [visibility, setVisibility] = useState(null);
  // The camera setup card: 'start' before a set (Start opens the camera),
  // 'info' when asked for from the idle screen.
  const [guide, setGuide] = useState(null);
  // The last camera session, while its "Miscounted?" form is open.
  const [miscount, setMiscount] = useState(null);
  // The small how-to figure on the stage: shown during sets once asked for,
  // and on its own between sets (it is the next exercise then), until hidden.
  const [dockOpen, setDockOpen] = useState(false);
  const [restDockOpen, setRestDockOpen] = useState(true);
  // The full guide, opened from the figure; a set running then waits for it.
  const [guideSheet, setGuideSheet] = useState(false);
  const resumeAfterGuideRef = useRef(false);

  const [source, setSource] = useState(null);
  const [sourceConfig, setSourceConfig] = useState(null);
  // null until the startup probe has answered.
  const [availableSourceIds, setAvailableSourceIds] = useState(null);

  /**
   * On a short phone, once the exercise and source rows take their share of
   * the screen, the stage's centred content (the 140pt counter above all) can
   * be taller than the stage and would spill over the rows around it. It is
   * scaled down to fit instead. Layout ignores transforms, so measuring the
   * scaled content cannot feed back into the scale.
   */
  const [stageHeight, setStageHeight] = useState(0);
  const [stageContentHeight, setStageContentHeight] = useState(0);
  const onStageLayout = useCallback((e) => setStageHeight(e.nativeEvent.layout.height), []);
  const onStageContentLayout = useCallback(
    (e) => setStageContentHeight(e.nativeEvent.layout.height),
    [],
  );
  const stageRoom = stageHeight - spacing.md; // a little air above and below
  const fitScale =
    stageRoom > 0 && stageContentHeight > stageRoom ? stageRoom / stageContentHeight : 1;

  // The plan being followed. Adopted from the prop only between workouts, so
  // a plan picked mid-set can never swap the targets under a running set.
  const [activePlan, setActivePlan] = useState(plan);
  useEffect(() => {
    if (status !== 'idle') return;
    setActivePlan(plan);
    if (plan) {
      // A fresh plan deserves its own hint, not the last workout's summary.
      setSummary(null);
      setNotice(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  const planSets = activePlan?.kind === 'program' ? activePlan.sets : null;
  const setIndex = completedSets.length; // 0-based index of the set in progress
  const planIndex = planSets ? Math.min(setIndex, planSets.length - 1) : 0;

  // What is being counted. A schedule day names the exercise of every set;
  // otherwise it is the one picked on this screen. Both only change between
  // sets, so a running set keeps the exercise it started with.
  const exercise = planSets
    ? getExercise(planSets[planIndex].exerciseId)
    : getExercise(settings.exerciseId);
  const holdMode = exercise.kind === 'hold';

  // Everything the async handlers (camera messages, timers) read is mirrored
  // here so a closure can never save a stale count.
  const live = useRef(freshLive());

  // The countdown before a resumed set is still part of that set's pause.
  const timerStatus =
    status === 'active' ? 'active' : status === 'paused' || resuming ? 'paused' : 'idle';
  const { elapsedSeconds, readElapsedMs, reset: resetTimer } = useWorkoutTimer(timerStatus);
  const { repFeedback, controlFeedback, tickFeedback, goFeedback, doneFeedback, sayCoach } = useFeedback(
    settings,
    speechTag,
  );

  const currentTarget = planSets ? planSets[planIndex] : null;
  const isLastSet = !!planSets && setIndex === planSets.length - 1;
  const restSeconds = planSets ? activePlan.restSeconds : settings.restSeconds;
  // A source that measures from where the phone is put (motion) always gets
  // time to put it there, even with the countdown switched off.
  const countdownSeconds = Math.max(settings.countdownSeconds || 0, source?.settleSeconds || 0);

  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  // --- startup: which input this device can actually use -------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const available = [];
      for (const candidate of SOURCES) {
        if (await candidate.isAvailableAsync()) available.push(candidate.id);
      }
      if (cancelled) return;
      setAvailableSourceIds(available);
    })();
    return () => {
      cancelled = true;
    };
    // Runs once: the hardware does not change between workouts.
  }, []);

  /**
   * The source for this exercise, out of the ones that can count it on this
   * device: the one last chosen for it, else (push-ups only) the choice saved
   * before each exercise had its own, else the exercise's best. A stored
   * choice only wins if that hardware is still present. Picked again when the
   * exercise changes, which only happens between workouts — or, on a schedule
   * day, in the rest before the next exercise, where only sources that need
   * no setting up are picked.
   */
  useEffect(() => {
    if (!availableSourceIds || (status !== 'idle' && status !== 'rest')) return;
    const usable = exercise.sources.filter(
      (id) => availableSourceIds.includes(id) && (!planSets || PROGRAM_SOURCE_IDS.includes(id)),
    );
    const stored = settings.sourceIds?.[exercise.id];
    const legacy = exercise.id === DEFAULT_EXERCISE_ID ? settings.sourceId : null;
    // Through a schedule day, the way of counting carries over: the camera
    // stays the camera, and without it tapping becomes the stopwatch for a
    // hold and back again, rather than switching the camera on mid-workout.
    const carried = !planSets || !source
      ? null
      : usable.includes(source.id)
        ? source.id
        : source.isPoseDriven
          ? null
          : usable.find((id) => id !== 'ai');
    const pick = [carried, stored, legacy].find((id) => id && usable.includes(id)) ?? usable[0];
    const next = getSourceById(pick); // tap, if somehow nothing else is usable
    if (next === source) return;
    setSource(next);
    setSourceConfig(null); // a calibration belongs to the source it measured
    // The stored choices are read, not followed: picking a source writes the
    // state and the setting together, so a settings write has nothing to add.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise, availableSourceIds, planSets]);

  // --- keep the screen on for the duration of a workout --------------------
  useEffect(() => {
    if (status !== 'idle') {
      activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    } else {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    }
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [status]);

  /**
   * Live coaching from the pose analyser. This runs on every camera frame, so
   * it only touches state when the message actually changes — setting the same
   * string 30 times a second would re-render the whole screen for nothing.
   *
   * Messages are held for a beat rather than mirrored frame by frame. The
   * analyser reports "shallow" and "bodySag" only on the frame where the rep
   * finishes, so rendering issues raw would flash the advice for ~33ms and
   * clear it, which nobody can read. A counted rep clears it immediately,
   * since that is the answer to the advice.
   */
  const coachUntilRef = useRef(0);
  const coachKeys = COACH_KEYS[exercise.id];
  const handlePoseFrame = useCallback((frame) => {
    const now = Date.now();
    const key = coachKeys[frame.issues?.[0]] ?? null;

    let next;
    if (frame.repCompleted) {
      next = null;
      coachUntilRef.current = 0;
    } else if (key) {
      next = key;
      coachUntilRef.current = now + COACH_STICKY_MS;
    } else {
      next = now < coachUntilRef.current ? undefined : null; // undefined = keep
    }

    if (next !== undefined) setCoach((prev) => (prev === next ? prev : next));
  }, [coachKeys]);


  // --- workout lifecycle ----------------------------------------------------
  const closeRest = useCallback(() => {
    const startedAt = live.current.restStartedAt;
    if (startedAt) {
      live.current.restSeconds += (Date.now() - startedAt) / 1000;
      live.current.restStartedAt = null;
    }
  }, []);

  const resetWorkout = useCallback(() => {
    closeRest();
    live.current = freshLive();
    setStatus('idle');
    setReps(0);
    setCompletedSets([]);
    setRestOver(false);
    setCoach(null);
    setResuming(false);
    resetTimer();
  }, [closeRest, resetTimer]);

  const finishWorkout = useCallback(async () => {
    closeRest();
    const sets = live.current.sets;
    const totalCount = sets.reduce((sum, s) => sum + s.reps, 0);
    const durationSeconds = sets.reduce((sum, s) => sum + s.durationSeconds, 0);
    const restTotal = Math.round(live.current.restSeconds);
    const followed = activePlan;

    setStatus('paused'); // stop counting immediately while the write happens

    // A workout with no reps is not a workout — persisting it would dirty the
    // history list and the averages without recording anything real.
    if (totalCount === 0) {
      resetWorkout();
      setNotice({ tone: 'warn', text: t('notice.nothingSaved') });
      if (followed) onClearPlan?.();
      return;
    }

    doneFeedback(t('voice.done'));

    const goal = settings.dailyGoal;
    const todayBefore = stats.todayReps;
    const achievementsBefore = achievements;

    // One session per exercise, so every exercise's history, totals and badges
    // stay its own: a schedule day of six exercises saves six. A hold's reps
    // are its seconds. Rest is the workout's, so it goes on the first.
    const groups = groupByExercise(sets);
    const saved = [];
    let earnedSeconds = 0;
    for (const [i, group] of groups.entries()) {
      const groupReps = group.sets.reduce((sum, s) => sum + s.reps, 0);
      if (groupReps === 0) continue;
      const session = await addSession({
        totalReps: groupReps,
        durationSeconds: group.sets.reduce((sum, s) => sum + s.durationSeconds, 0),
        sourceId: group.sets[0].sourceId,
        exerciseId: group.exerciseId,
        sets: group.sets,
        restSeconds: i === 0 ? restTotal : 0,
        program:
          followed?.kind === 'program'
            ? { level: followed.level, week: followed.week, day: followed.day }
            : null,
      });
      saved.push(session);
      // Credited with the save, so fun time always matches the history: a
      // discarded workout earns nothing, exactly as it records nothing.
      // Lighter exercises earn a share of a push-up's rate.
      earnedSeconds += await creditReps(groupReps, getExercise(group.exerciseId).creditWeight);
    }

    // A schedule day is done once every one of its sets is.
    let scheduleCompleted = schedule?.completed ?? {};
    const dayDone = followed?.kind === 'program' && sets.length >= followed.sets.length;
    if (dayDone) {
      await completeScheduleDay(followed.week, followed.day);
      scheduleCompleted = {
        ...scheduleCompleted,
        [programDayKey(followed.week, followed.day)]: Date.now(),
      };
    }

    // The daily goal counts reps; a hold's seconds are not reps.
    const repsToday = saved.filter((s) => !isHold(s.exerciseId)).reduce((sum, s) => sum + s.totalReps, 0);
    const celebrations = [];
    if (goal > 0 && todayBefore < goal && todayBefore + repsToday >= goal) {
      celebrations.push(t('notice.goalReached'));
    }
    const achievementsAfter = unlockedAchievements(
      [...saved.slice().reverse(), ...sessions],
      program?.completedDays ?? {},
      scheduleCompleted,
    );
    for (const id of newlyUnlocked(achievementsBefore, achievementsAfter)) {
      celebrations.push(t('notice.achievement', { name: t(`ach.${id}.title`) }));
    }

    resetWorkout();
    const only = groups.length === 1 ? groups[0].exerciseId : null;
    setSummary({
      kind: followed?.kind === 'program' ? 'program' : 'free',
      week: followed?.week,
      day: followed?.day,
      exerciseId: only ?? groups[0].exerciseId,
      exercises: groups.length,
      totalReps: totalCount,
      reps: repsToday,
      sets: sets.length,
      durationSeconds,
      earnedSeconds,
      // For "Miscounted?", which only a single camera-counted exercise offers.
      sourceId: groups.length === 1 ? groups[0].sets[0].sourceId : null,
      at: saved[0]?.timestamp ?? Date.now(),
    });
    const time = formatDuration(durationSeconds);
    const savedText =
      groups.length > 1
        ? t('notice.savedProgram', { n: groups.length, time })
        : isHold(only)
          ? t('notice.savedHold', { reps: totalCount, time })
          : t('notice.saved', { reps: totalCount, time });
    setNotice({
      tone: 'ok',
      text: earnedSeconds
        ? `${savedText} ${t('notice.earned', { time: formatAmount(earnedSeconds, t) })}`
        : savedText,
    });
    if (celebrations.length) onCelebrate?.(celebrations);
    if (followed) onClearPlan?.();
  }, [
    closeRest,
    activePlan,
    resetWorkout,
    t,
    onClearPlan,
    doneFeedback,
    settings.dailyGoal,
    stats.todayReps,
    achievements,
    addSession,
    program,
    schedule,
    completeScheduleDay,
    sessions,
    onCelebrate,
    creditReps,
  ]);

  // The motion source reads its tilt thresholds from the exercise; a source's
  // own calibration result wins over them. Memoised, because a new object on
  // every render would resubscribe the sensor mid-set.
  const detectorConfig = useMemo(
    () => (exercise.motion ? { ...exercise.motion, ...sourceConfig } : sourceConfig),
    [exercise.motion, sourceConfig],
  );

  const { isNear, onTouchStart, onTouchEnd, reset: resetDetector } = useRepDetector({
    source,
    sourceConfig: detectorConfig,
    active: status === 'active',
    onRep: () => handleRepRef.current?.(),
    minRepMs: exercise.minRepMs,
  });

  const activate = useCallback(() => {
    // "Last set" was already said when that set began; a resume is just "go".
    goFeedback(isLastSet && !resuming ? t('voice.lastSet') : t('voice.go'));
    resetDetector();
    setResuming(false);
    setStatus('active');
  }, [goFeedback, isLastSet, resuming, t, resetDetector]);

  const beginSet = useCallback(() => {
    closeRest();
    live.current.reps = 0;
    setReps(0);
    setRestOver(false);
    setCoach(null);
    resetTimer();
    resetDetector();
    if (countdownSeconds > 0) setStatus('countdown');
    else activate();
  }, [closeRest, resetTimer, resetDetector, countdownSeconds, activate]);

  const endSet = useCallback(() => {
    const setReps_ = live.current.reps;
    // Done without a single rep means done with the workout.
    if (setReps_ === 0) {
      finishWorkout();
      return;
    }
    const durationSeconds = Math.round(readElapsedMs() / 1000);
    const done = [
      ...live.current.sets,
      { reps: setReps_, durationSeconds, exerciseId: exercise.id, sourceId: source?.id },
    ];
    live.current.sets = done;
    setCompletedSets(done);

    // The last set of a schedule day ends the workout.
    if (planSets && done.length >= planSets.length) {
      finishWorkout();
      return;
    }
    doneFeedback(t('voice.rest'));
    live.current.restStartedAt = Date.now();
    setRestOver(false);
    setStatus('rest');
  }, [finishWorkout, readElapsedMs, planSets, doneFeedback, t, exercise.id, source]);

  const handleRep = useCallback(() => {
    const next = live.current.reps + 1;
    live.current.reps = next;
    setReps(next);
    // A hold counts a "rep" a second: saying every one would never stop.
    if (!holdMode || next % HOLD_SPEAK_EVERY === 0) repFeedback(next);
    // A program set with a fixed target completes itself; the max set never
    // does, since "as many as you can" is only over when you say so.
    if (currentTarget && !currentTarget.max && next >= currentTarget.target) endSet();
  }, [repFeedback, currentTarget, endSet, holdMode]);

  const handleRepRef = useRef(handleRep);
  useEffect(() => {
    handleRepRef.current = handleRep;
  }, [handleRep]);

  // The timer source: a hold without the camera is a stopwatch, a "rep" each
  // second the set is active.
  const timerDriven = !!source?.isTimerDriven;
  useEffect(() => {
    if (!timerDriven || status !== 'active') return undefined;
    const id = setInterval(() => handleRepRef.current?.(), 1000);
    return () => clearInterval(id);
  }, [timerDriven, status]);

  const countdownRemaining = useCountdown({
    seconds: status === 'rest' ? restSeconds : countdownSeconds,
    active: status === 'countdown' || status === 'rest',
    runKey: `${status}-${setIndex}`,
    onTick: (left) => {
      if (left <= TICK_FROM) tickFeedback();
    },
    onDone: () => {
      if (status === 'countdown') {
        activate();
      } else if (status === 'rest') {
        // The program knows what comes next; a free workout waits to be told.
        if (planSets) beginSet();
        else setRestOver(true);
      }
    },
  });

  // --- controls ------------------------------------------------------------
  const start = useCallback(async ({ skipGuide = false } = {}) => {
    if (!source) return;
    // The first camera set of each exercise shows where to put the phone.
    if (source.isPoseDriven && !skipGuide && !settings.setupSeen?.[exercise.id]) {
      setGuide('start');
      return;
    }
    controlFeedback();
    setNotice(null);
    setSummary(null);
    live.current = freshLive();
    setCompletedSets([]);

    // Light-based detection needs to know what "uncovered" looks like in this
    // room before it can recognise "covered".
    if (source.calibrateAsync) {
      setStatus('calibrating');
      const result = await source.calibrateAsync();
      if (!result.ok) {
        setStatus('idle');
        setNotice({ tone: 'warn', text: t(result.messageKey, result.messageParams) });
        return;
      }
      setSourceConfig(result);
      setNotice({ tone: 'ok', text: t(result.messageKey, result.messageParams) });
    }

    beginSet();
  }, [source, controlFeedback, t, beginSet, settings.setupSeen, exercise.id]);

  const closeGuide = useCallback(
    (andStart) => {
      const wasStart = guide === 'start';
      setGuide(null);
      if (!settings.setupSeen?.[exercise.id]) {
        updateSettings({ setupSeen: { ...settings.setupSeen, [exercise.id]: true } });
      }
      if (andStart && wasStart) start({ skipGuide: true });
    },
    [guide, settings.setupSeen, exercise.id, updateSettings, start],
  );

  // Also what Cancel does on the countdown back into a paused set: the set
  // stays paused, its reps intact.
  const pause = useCallback(() => {
    controlFeedback();
    setResuming(false);
    setStatus('paused');
  }, [controlFeedback]);

  const resume = useCallback(() => {
    controlFeedback();
    resetDetector();
    // Resume is pressed with the phone in hand; a source that measures from
    // where the phone sits counts down first, so it can go back in place.
    if (source?.settleSeconds) {
      setResuming(true);
      setStatus('countdown');
    } else {
      setStatus('active');
    }
  }, [controlFeedback, resetDetector, source]);

  // Not for a source that measures from where the phone is put (motion): the
  // countdown is the time to put it there, and Skip is tapped with the phone
  // still in hand, so the baseline would be the hand and the set count nothing.
  const skipCountdown = useCallback(() => {
    if (source?.settleSeconds) return;
    controlFeedback();
    activate();
  }, [source, controlFeedback, activate]);

  /**
   * The full guide from the figure on the stage. Reading it mid-set is not
   * doing reps, so a running set pauses for it and carries on once it closes:
   * no trip through Pause and back.
   */
  const openGuideSheet = useCallback(() => {
    if (status === 'active') {
      resumeAfterGuideRef.current = true;
      pause();
    }
    setGuideSheet(true);
  }, [status, pause]);

  const closeGuideSheet = useCallback(() => {
    setGuideSheet(false);
    if (resumeAfterGuideRef.current && status === 'paused') resume();
    resumeAfterGuideRef.current = false;
  }, [status, resume]);

  // Each rest shows the next exercise again, even if the last one was hidden.
  useEffect(() => {
    if (status === 'rest') setRestDockOpen(true);
  }, [status]);

  const nextSet = useCallback(() => {
    controlFeedback();
    beginSet();
  }, [controlFeedback, beginSet]);

  const done = useCallback(() => {
    controlFeedback();
    endSet();
  }, [controlFeedback, endSet]);

  const finish = useCallback(() => {
    controlFeedback();
    finishWorkout();
  }, [controlFeedback, finishWorkout]);

  const confirmDiscard = useCallback(() => {
    const total = live.current.sets.reduce((sum, s) => sum + s.reps, 0) + live.current.reps;
    confirm({
      title: t('confirm.discardTitle'),
      message: t('confirm.discardBody', { reps: total }),
      confirmText: t('confirm.discard'),
      cancelText: t('confirm.keep'),
      destructive: true,
      onConfirm: () => {
        resetWorkout();
        if (activePlan) onClearPlan?.();
      },
    });
  }, [t, resetWorkout, activePlan, onClearPlan]);

  const selectSource = useCallback(
    (nextSource) => {
      if (status !== 'idle') return;
      controlFeedback();
      setSource(nextSource);
      setSourceConfig(null);
      setNotice(null);
      // Remembered per exercise: the camera may suit squats, the sensor push-ups.
      updateSettings({ sourceIds: { ...settings.sourceIds, [exercise.id]: nextSource.id } });
    },
    [status, controlFeedback, updateSettings, settings.sourceIds, exercise.id],
  );

  const selectExercise = useCallback(
    (exerciseId) => {
      // Only between workouts, and never under a plan: a schedule day names its own.
      if (status !== 'idle' || activePlan || exerciseId === exercise.id) return;
      controlFeedback();
      setNotice(null);
      updateSettings({ exerciseId });
    },
    [status, activePlan, exercise.id, controlFeedback, updateSettings],
  );

  const share = useCallback(() => {
    if (!summary) return;
    let text = t(isHold(summary.exerciseId) ? 'share.textHold' : 'share.text', {
      reps: summary.totalReps,
      time: formatDuration(summary.durationSeconds),
      exercise: t(`exercise.${summary.exerciseId}.noun`),
    });
    if (summary.sets > 1) text += t('share.sets', { sets: summary.sets });
    shareText(text);
  }, [summary, t]);

  // The shell's back-button handling: pause a running set instead of leaving.
  // The countdown back into a paused set is still that set's pause, so back
  // there keeps it paused, as Cancel does.
  useEffect(() => {
    if (!controlsRef) return;
    controlsRef.current = {
      busy: status !== 'idle',
      pause: () => {
        if (status === 'active' || (status === 'countdown' && resuming)) pause();
      },
    };
  }, [controlsRef, status, resuming, pause]);

  // A camera that is off has no view; the next one starts waiting afresh.
  const cameraOn = !!source?.isPoseDriven && status !== 'idle' && status !== 'calibrating';
  useEffect(() => {
    if (!cameraOn) setVisibility(null);
  }, [cameraOn]);

  // --- render --------------------------------------------------------------
  // Only sources this device has that can count this exercise, best first.
  const selectableSources = useMemo(
    () =>
      exercise.sources.filter((id) => availableSourceIds?.includes(id)).map(getSourceById),
    [exercise, availableSourceIds],
  );

  /**
   * What the camera has to say, out loud: from across the room neither the
   * form advice nor "not in frame" can be read. The camera's wish comes first
   * (out of frame, nothing else can be judged), then the form advice. Said
   * when it changes and again every few seconds while it stands (sayCoach
   * spaces repeats), so a plank sagging for ten seconds hears it more than once.
   */
  // Above the early return below: hooks must run on every render.
  const outOfFrame =
    cameraOn && (status === 'countdown' || status === 'active') && visibility && !visibility.ready
      ? visibility.missing || []
      : [];
  const cue = outOfFrame.length
    ? `${t('vis.missing', { parts: outOfFrame.map((part) => t(`vis.part.${part}`)).join(', ') })}. ${t('vis.hintSpoken')}`
    : cameraOn && coach && status === 'active'
      ? t(coach)
      : null;
  useEffect(() => {
    if (!cue) return undefined;
    sayCoach(cue);
    const timer = setInterval(() => sayCoach(cue), CUE_REPEAT_CHECK_MS);
    return () => clearInterval(timer);
  }, [cue, sayCoach]);

  // Back in frame after being told to step back: say so, so nobody has to walk
  // up to the phone to check.
  const wasOutRef = useRef(false);
  const inView = !!visibility?.ready;
  useEffect(() => {
    if (outOfFrame.length) wasOutRef.current = true;
    else if (inView && wasOutRef.current) {
      wasOutRef.current = false;
      sayCoach(t('vis.readySpoken'), { force: true });
    }
    // outOfFrame is rebuilt every render; its length is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outOfFrame.length, inView]);

  if (!source) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const statusColor = STATUS_COLOR[status];
  const tapActive = !!source.isTapDriven && status === 'active';
  const poseActive = !!source.isPoseDriven && status !== 'idle' && status !== 'calibrating';
  const running = status !== 'idle';
  // The motion source rides on the body — a pocket against the thigh, a hand
  // gripping the phone, the chest under both hands — with the screen kept on
  // and touchable. A brush there would press Pause or Done (and Done with no
  // reps ends the workout), so while it counts, or counts down to counting,
  // the screen takes no touches but a long press, which pauses. Fabric and a
  // gripping hand move too much to hold one.
  const pocketLock = source.id === 'motion' && (status === 'countdown' || status === 'active');
  const setsDone = completedSets.length;
  const totalSets = planSets ? planSets.length : null;
  // Fun time so far this workout, each set at its own exercise's weight.
  const workoutReps = completedSets.reduce((sum, s) => sum + s.reps, 0) + reps;
  const workoutCredit =
    completedSets.reduce(
      (sum, s) => sum + creditFor(s.reps, blockerRate, getExercise(s.exerciseId).creditWeight),
      0,
    ) + creditFor(reps, blockerRate, exercise.creditWeight);
  // Where to put the phone depends on both. For the one render between an
  // exercise change and its source being picked, the source's own hint.
  const hintKey = supportsSource(exercise.id, source.id)
    ? `exercise.${exercise.id}.hint.${source.id}`
    : source.hintKey;
  const summaryExercise = getExercise(summary?.exerciseId);

  // Set n of this exercise's sets, and its target: reps, or seconds held.
  const planLine = (() => {
    if (!planSets) return null;
    const target = planSets[planIndex];
    const which = t('workout.set', setOfExercise(planSets, planIndex));
    const goal = target.hold
      ? t('workout.holdTarget', { n: target.target })
      : target.max
        ? t('workout.maxSet', { n: target.target })
        : t('workout.target', { n: target.target });
    return `${exercise.icon} ${t(`exercise.${exercise.id}`)} · ${which} · ${goal}`;
  })();
  // In the rest before a different exercise, what comes next.
  const lastSet = completedSets[setsDone - 1];
  const nextUp =
    planSets && status === 'rest' && lastSet && lastSet.exerciseId !== exercise.id
      ? t('workout.nextExercise', { exercise: `${exercise.icon} ${t(`exercise.${exercise.id}`)}` })
      : null;
  const summaryCount = summary && isHold(summary.exerciseId) && summary.exercises === 1;
  // Not with the phone in a pocket (nobody sees it), nor while the camera starts.
  const showDock = running && status !== 'calibrating' && !pocketLock;


  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top, paddingBottom: running ? insets.bottom : 0 },
      ]}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>HÍT ĐẤT AI</Text>
          <Text style={styles.brandSub}>{t('brand.tagline')}</Text>
        </View>
        {planSets ? (
          <Text style={styles.headerPlan}>
            {t('workout.programDay', { day: activePlan.day, week: activePlan.week })}
          </Text>
        ) : earning && status === 'idle' ? (
          <Pressable
            onPress={onOpenBlocker}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={
              blockerOff
                ? t('blocker.chipOff')
                : t('blocker.chipA11y', { time: formatAmount(blocker.balanceSeconds, t) })
            }
            style={({ pressed }) => [
              styles.funChip,
              blockerOff && styles.funChipOff,
              pressed && styles.pressedDim,
            ]}
          >
            <Text style={[styles.funChipText, blockerOff && styles.funChipTextOff]}>
              {blockerOff ? `⚠️ ${t('blocker.chipOff')}` : `🎮 ${formatDuration(blocker.balanceSeconds)}`}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.statsRow}>
        <StatTile label={t('stat.total')} value={stats.totalReps} />
        <View style={styles.gap} />
        <StatTile
          label={t('stat.today')}
          value={stats.todayReps}
          highlight
          progress={{
            value: stats.todayReps,
            max: settings.dailyGoal,
            caption: t('stat.goal', { goal: settings.dailyGoal }),
          }}
        />
        <View style={styles.gap} />
        <StatTile
          label={t('stat.streak')}
          value={stats.streak}
          suffix={stats.streak === 1 ? t('common.day') : t('common.days')}
        />
      </View>

      {status === 'idle' && !activePlan ? (
        <ExerciseLibraryButton
          selected={exercise.id}
          onSelect={selectExercise}
          style={styles.exerciseRow}
        />
      ) : null}

      {/*
        Raw touch/pointer handlers rather than Pressable: Pressability inserts a
        press-responder stage before onPressIn (measured at ~69ms), which the
        detector would wrongly bill to the rep's hold time and reject fast reps.
        Touch and pointer handlers both fire immediately, and the detector
        ignores repeated same-state transitions, so double delivery is harmless.
      */}
      <View style={styles.stageWrap}>
      <View
        style={[styles.stage, tapActive && styles.stageArmed, isNear && styles.stageNear]}
        testID="rep-stage"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onPointerDown={onTouchStart}
        onPointerUp={onTouchEnd}
        onPointerCancel={onTouchEnd}
        accessible={tapActive}
        accessibilityRole={tapActive ? 'button' : undefined}
        accessibilityLabel={tapActive ? `${reps} ${t('common.reps')}` : undefined}
        onLayout={onStageLayout}
      >
        {poseActive ? (
          <PoseStage
            active
            exercise={exercise.id}
            paused={status !== 'active'}
            onRep={() => handleRepRef.current?.()}
            onFrame={handlePoseFrame}
            onVisibility={setVisibility}
          />
        ) : null}
        {poseActive ? <VisibilityPill visibility={visibility} /> : null}

        <View
          style={[styles.stageContent, fitScale < 1 && { transform: [{ scale: fitScale }] }]}
          onLayout={onStageContentLayout}
        >
          {status === 'idle' && summary ? (
            <View style={styles.summary}>
              <Text style={styles.summaryTitle}>
                {summary.kind === 'program'
                  ? t('workout.summaryProgram', { week: summary.week, day: summary.day })
                  : t('workout.summaryTitle')}
              </Text>
              <Text style={styles.summaryReps} allowFontScaling={false}>
                {/* Several exercises: their reps together (holds are not reps), else the sets. */}
                {summary.exercises > 1 ? summary.reps || summary.sets : summary.totalReps}
              </Text>
              <Text style={styles.summaryMeta}>
                {[
                  summary.exercises > 1
                    ? t('workout.exercisesDone', { n: summary.exercises })
                    : `${summaryExercise.icon} ${t(`exercise.${summaryExercise.id}`)}`,
                  summary.exercises > 1
                    ? `${summary.sets} ${t('common.sets')}`
                    : summaryCount
                      ? t('common.secs')
                      : `${summary.sets} ${t('common.sets')}`,
                  formatDuration(summary.durationSeconds),
                ].join(' · ')}
              </Text>
              {summary.earnedSeconds ? (
                <Text style={styles.earnedLine}>
                  {t('workout.earned', { time: formatAmount(summary.earnedSeconds, t) })}
                </Text>
              ) : null}
              <Pressable
                onPress={share}
                hitSlop={8}
                accessibilityRole="button"
                style={({ pressed }) => [styles.shareBtn, pressed && styles.pressedDim]}
              >
                <Text style={styles.shareText}>{t('btn.share')}</Text>
              </Pressable>
              {summary.sourceId === 'ai' && summary.exercises === 1 ? (
                <View style={styles.summaryLinks}>
                  <Pressable
                    onPress={() =>
                      setMiscount({
                        exerciseId: summary.exerciseId,
                        sourceId: summary.sourceId,
                        totalReps: summary.totalReps,
                        durationSeconds: summary.durationSeconds,
                        timestamp: summary.at,
                      })
                    }
                    hitSlop={8}
                    accessibilityRole="button"
                  >
                    <Text style={styles.summaryLink}>{t('miscount.link')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onOpenChallenge?.(summary.exerciseId)}
                    hitSlop={8}
                    accessibilityRole="button"
                  >
                    <Text style={styles.summaryLink}>{t('challenge.fromSummary')}</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : (
            <>
              <View style={[styles.statusPill, { borderColor: statusColor }]}>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                <Text style={[styles.statusText, { color: statusColor }]}>
                  {t(`status.${status}`)}
                </Text>
              </View>

              {status === 'calibrating' ? (
                <ActivityIndicator color={colors.warn} style={styles.spinner} />
              ) : status === 'countdown' ? (
                <>
                  <Text style={styles.counter} allowFontScaling={false}>
                    {countdownRemaining || countdownSeconds}
                  </Text>
                  {planLine ? <Text style={styles.subline}>{planLine}</Text> : null}
                </>
              ) : status === 'rest' ? (
                <>
                  {restOver ? (
                    <Text style={styles.restOver} allowFontScaling={false}>
                      {t('workout.restOver')}
                    </Text>
                  ) : (
                    <Text style={styles.counter} allowFontScaling={false}>
                      {countdownRemaining}
                    </Text>
                  )}
                  <Text style={styles.subline}>
                    {t(isHold(lastSet?.exerciseId) ? 'workout.setDoneHold' : 'workout.setDone', {
                      n: setsDone,
                      reps: lastSet?.reps ?? 0,
                    })}
                  </Text>
                  {nextUp ? <Text style={styles.subline}>{nextUp}</Text> : null}
                  <Text style={styles.stageHint}>
                    {planSets ? t('workout.nextIn') : t('workout.restHint')}
                  </Text>
                </>
              ) : (
                <>
                  <Text
                    style={styles.counter}
                    allowFontScaling={false}
                    accessibilityLabel={`${reps} ${holdMode ? t('common.secs') : t('common.reps')}`}
                  >
                    {reps}
                  </Text>
                  {/* A hold's count is seconds with good form; the clock is all of the set. */}
                  {holdMode ? <Text style={styles.unit}>{t('common.secs')}</Text> : null}
                  <Text style={styles.timer} allowFontScaling={false}>
                    {formatDuration(elapsedSeconds)}
                  </Text>
                  {running && planLine ? <Text style={styles.subline}>{planLine}</Text> : null}
                  {running && earning && workoutReps > 0 ? (
                    <Text style={styles.earnedLine}>
                      {t('workout.earned', { time: formatAmount(workoutCredit, t) })}
                    </Text>
                  ) : null}
                  {tapActive ? (
                    <Text style={styles.stageHint}>
                      {isNear ? t('workout.tapHold') : t('workout.tapTouch')}
                    </Text>
                  ) : null}
                </>
              )}
            </>
          )}
        </View>

        {/* Outside the scaled content: it is pinned to the stage's bottom edge. */}
        {poseActive && coach && status === 'active' ? (
          <View style={styles.coachPill}>
            <Text style={styles.coachText}>{t(coach)}</Text>
          </View>
        ) : null}
      </View>

        {/*
          A sibling of the stage, not a child: a press on it must not reach the
          stage's touch handlers, which would count it as a tapped rep.
        */}
        {showDock ? (
          <GuideDock
            exerciseId={exercise.id}
            open={status === 'rest' ? restDockOpen : dockOpen}
            onToggle={status === 'rest' ? setRestDockOpen : setDockOpen}
            onDetails={openGuideSheet}
            upNext={!!nextUp}
            style={[styles.dock, { top: spacing.md + (poseActive ? 52 : spacing.sm) }]}
          />
        ) : null}
      </View>
      <ExerciseGuideSheet visible={guideSheet} exerciseId={exercise.id} onClose={closeGuideSheet} />

      <Text
        style={[styles.notice, notice?.tone === 'warn' && styles.noticeWarn]}
        numberOfLines={3}
      >
        {notice
          ? notice.text
          : status === 'idle'
            ? t(hintKey)
            : ' '}
      </Text>

      {status === 'idle' && planSets ? (
        <View style={styles.planCard}>
          <Text style={styles.planSets} numberOfLines={2}>
            {activePlan.items
              .map((item) =>
                `${getExercise(item.exerciseId).icon} ${item.sets}×${item.target}${item.hold ? 's' : ''}`,
              )
              .join('  ')}
          </Text>
          <Text style={styles.planRest}>
            {t('program.rest', { seconds: activePlan.restSeconds })}
          </Text>
          <View style={styles.planGuides}>
            {[...new Set(activePlan.items.map((item) => item.exerciseId))].map((id) => (
              <ExerciseGuideButton
                key={id}
                exerciseId={id}
                label={`${getExercise(id).icon} ${t('guide.button')}`}
              />
            ))}
          </View>
          <Pressable onPress={() => onClearPlan?.()} hitSlop={8} accessibilityRole="button">
            <Text style={styles.planCancel}>{t('btn.cancelPlan')}</Text>
          </Pressable>
        </View>
      ) : null}

      {status === 'idle' && selectableSources.length > 1 ? (
        <View style={styles.sourceRow}>
          {selectableSources.map((candidate) => {
            const selected = candidate.id === source.id;
            return (
              <Pressable
                key={candidate.id}
                onPress={() => selectSource(candidate)}
                style={[styles.chip, selected && styles.chipSelected]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {t(candidate.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={styles.controls}>
        {status === 'idle' ? (
          <Button
            label={
              planSets
                ? t('btn.startProgramDay', { week: activePlan.week, day: activePlan.day })
                : t('btn.start')
            }
            onPress={() => start()}
            style={styles.grow}
          />
        ) : null}

        {status === 'calibrating' ? (
          <Button label={t('btn.calibrating')} onPress={() => {}} disabled style={styles.grow} />
        ) : null}

        {status === 'countdown' ? (
          <>
            <Button
              label={t('common.cancel')}
              variant="secondary"
              // Into a new set, Cancel ends the workout; back into a paused
              // one it must not drop that set's reps, so the set stays paused.
              onPress={resuming ? pause : finish}
              style={styles.grow}
            />
            {source.settleSeconds ? null : (
              <>
                <View style={styles.gap} />
                <Button label={t('btn.skip')} onPress={skipCountdown} style={styles.grow} />
              </>
            )}
          </>
        ) : null}

        {status === 'active' || status === 'paused' ? (
          <>
            <Button
              label={status === 'active' ? t('btn.pause') : t('btn.resume')}
              variant="secondary"
              onPress={status === 'active' ? pause : resume}
              style={styles.grow}
            />
            <View style={styles.gap} />
            <Button label={t('btn.done')} onPress={done} style={styles.grow} />
          </>
        ) : null}

        {status === 'rest' ? (
          <>
            <Button
              label={t('btn.finishWorkout')}
              variant="secondary"
              onPress={finish}
              style={styles.grow}
            />
            <View style={styles.gap} />
            <Button label={t('btn.nextSet')} onPress={nextSet} style={styles.grow} />
          </>
        ) : null}
      </View>

      <View style={styles.footer}>
        {status === 'idle' ? (
          <View style={styles.footerLinks}>
            {source.isPoseDriven ? (
              <Pressable onPress={() => setGuide('info')} hitSlop={8} accessibilityRole="button">
                <Text style={styles.footerLink}>{t('setup.link')}</Text>
              </Pressable>
            ) : null}
            {planSets ? null : (
              <Pressable onPress={() => onOpenChallenge?.(exercise.id)} hitSlop={8} accessibilityRole="button">
                <Text style={styles.footerLink}>{t('challenge.entry')}</Text>
              </Pressable>
            )}
          </View>
        ) : status === 'paused' ? (
          <Pressable onPress={confirmDiscard} hitSlop={8} accessibilityRole="button">
            <Text style={styles.discard}>{t('btn.discard')}</Text>
          </Pressable>
        ) : running && (totalSets || setsDone > 0) ? (
          <View style={[styles.dots, planSets && styles.dotsDense]} accessibilityLabel={t('workout.set', { n: setIndex + 1, total: totalSets ?? setIndex + 1 })}>
            {Array.from({ length: totalSets ?? setsDone + 1 }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  planSets && styles.dotSmall,
                  i < setsDone && styles.dotDone,
                  i === setsDone && status !== 'rest' && styles.dotCurrent,
                ]}
              />
            ))}
          </View>
        ) : null}
      </View>

      {pocketLock ? (
        <View
          style={styles.lock}
          // Every touch that misses the unlock button lands here and goes nowhere.
          onStartShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
        >
          <Pressable
            // Unlocking is what Pause (or, on the countdown, Cancel) would do;
            // the normal controls are back once it has.
            onLongPress={status === 'active' || resuming ? pause : finish}
            delayLongPress={1000}
            accessibilityRole="button"
            accessibilityHint={t('workout.lockHint')}
            style={({ pressed }) => [styles.lockButton, pressed && styles.lockButtonPressed]}
          >
            <Text style={styles.lockText}>{t('workout.holdToUnlock')}</Text>
          </Pressable>
        </View>
      ) : null}

      <Modal visible={!!guide} transparent animationType="fade" onRequestClose={() => closeGuide(false)}>
        <ScrollView style={styles.guideBackdrop} contentContainerStyle={styles.guideContent}>
          <CameraSetupGuide
            exerciseId={exercise.id}
            onStart={() => closeGuide(true)}
            startLabel={guide === 'start' ? t('setup.start') : t('setup.ok')}
            onCancel={guide === 'start' ? () => closeGuide(false) : undefined}
          />
        </ScrollView>
      </Modal>
      <MiscountModal session={miscount} onClose={() => setMiscount(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  centered: { alignItems: 'center', justifyContent: 'center' },
  pressedDim: { opacity: 0.6 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  brand: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: 2 },
  brandSub: { ...type.label, color: colors.textFaint, marginTop: -2, textTransform: 'uppercase' },
  headerPlan: { ...type.label, color: colors.accent },
  funChip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.accentDim,
    backgroundColor: colors.surface,
  },
  funChipText: { fontSize: 14, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  funChipOff: { borderColor: colors.warn },
  funChipTextOff: { color: colors.warn },
  earnedLine: {
    ...type.label,
    color: colors.accent,
    marginTop: spacing.sm,
    textAlign: 'center',
    textShadow: '0px 1px 8px rgba(0,0,0,0.85)',
  },

  statsRow: { flexDirection: 'row' },
  exerciseRow: { marginTop: spacing.md },
  gap: { width: spacing.sm },
  grow: { flex: 1 },

  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  stageContent: { alignSelf: 'stretch', alignItems: 'center' },
  stageArmed: { borderColor: colors.border, backgroundColor: colors.surface },
  stageNear: { borderColor: colors.accent, backgroundColor: colors.accentDim },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 5,
    paddingHorizontal: spacing.md,
    backgroundColor: 'rgba(10,10,11,0.6)',
  },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: spacing.sm },
  statusText: { ...type.label },
  spinner: { marginTop: spacing.lg },

  counter: {
    ...type.counter,
    color: colors.text,
    marginTop: spacing.sm,
    // Keeps the count readable over a bright camera frame.
    textShadow: '0px 2px 12px rgba(0,0,0,0.85)',
  },
  restOver: {
    fontSize: 40,
    fontWeight: '300',
    color: colors.text,
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
    textShadow: '0px 2px 12px rgba(0,0,0,0.85)',
  },
  timer: { ...type.timer, color: colors.textDim, marginTop: -spacing.sm },
  unit: { ...type.label, color: colors.textDim, marginTop: -spacing.md, marginBottom: spacing.sm },
  subline: {
    ...type.body,
    color: colors.text,
    marginTop: spacing.sm,
    textAlign: 'center',
    textShadow: '0px 1px 8px rgba(0,0,0,0.85)',
  },
  stageHint: {
    ...type.label,
    color: colors.textFaint,
    marginTop: spacing.lg,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  coachPill: {
    position: 'absolute',
    bottom: spacing.md,
    left: spacing.md,
    right: spacing.md,
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(10,10,11,0.82)',
    borderWidth: 1,
    borderColor: colors.warn,
  },
  // Big: it is read from where the camera can see the whole body.
  coachText: { fontSize: 24, fontWeight: '800', color: colors.warn, textAlign: 'center' },

  summary: { alignItems: 'center' },
  summaryTitle: { ...type.label, color: colors.accent },
  summaryReps: { ...type.counter, color: colors.text, marginTop: spacing.sm },
  summaryMeta: { ...type.body, color: colors.textDim, marginTop: -spacing.sm },
  shareBtn: {
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  shareText: { fontSize: 14, fontWeight: '600', color: colors.text },
  summaryLinks: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.md },
  summaryLink: { fontSize: 13, color: colors.textDim, textDecorationLine: 'underline' },
  footerLinks: { flexDirection: 'row', gap: spacing.lg },
  footerLink: { fontSize: 13, color: colors.textDim },
  guideBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)' },
  guideContent: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },

  notice: {
    ...type.body,
    color: colors.textDim,
    textAlign: 'center',
    minHeight: 40,
    marginBottom: spacing.sm,
  },
  noticeWarn: { color: colors.warn },

  planCard: { alignItems: 'center', marginBottom: spacing.md },
  planSets: { fontSize: 15, fontWeight: '600', color: colors.text, textAlign: 'center' },
  planRest: { fontSize: 13, color: colors.textDim, marginTop: 2 },
  planGuides: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  stageWrap: { flex: 1 },
  dock: { position: 'absolute', right: spacing.sm },
  planCancel: { fontSize: 13, color: colors.textFaint, marginTop: spacing.sm },

  sourceRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  chipText: { fontSize: 13, color: colors.textDim },
  chipTextSelected: { color: colors.text, fontWeight: '600' },

  controls: { flexDirection: 'row' },
  lock: {
    // absoluteFill: React Native 0.86 removed absoluteFillObject (see PoseStage).
    ...StyleSheet.absoluteFill,
    zIndex: 10,
    elevation: 10,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: spacing.xxl * 2,
    // Mostly see-through: the count stays readable behind it.
    backgroundColor: 'rgba(10, 10, 11, 0.35)',
  },
  lockButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  lockButtonPressed: { borderColor: colors.accent },
  lockText: { ...type.label, color: colors.textDim },
  footer: { height: 44, alignItems: 'center', justifyContent: 'center' },
  discard: { fontSize: 14, color: colors.danger },
  dots: { flexDirection: 'row', gap: spacing.sm },
  // A schedule day can run to twenty sets; they still fit one row.
  dotsDense: { gap: 5 },
  dotSmall: { width: 6, height: 6, borderRadius: 3 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotDone: { backgroundColor: colors.accent },
  dotCurrent: { borderWidth: 1, borderColor: colors.accent, backgroundColor: 'transparent' },
});
