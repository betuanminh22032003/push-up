import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { newlyUnlocked, unlockedAchievements } from '../achievements/achievements';
import { Button } from '../components/Button';
import { StatTile } from '../components/StatTile';
import { useCountdown } from '../hooks/useCountdown';
import { useFeedback } from '../hooks/useFeedback';
import { useRepDetector } from '../hooks/useRepDetector';
import { useWorkoutTimer } from '../hooks/useWorkoutTimer';
import { useI18n } from '../i18n/I18nContext';
import { PoseStage } from '../pose/PoseStage';
import { ISSUES } from '../pose/pushupAnalyzer';
import { SOURCES, getSourceById, resolveDefaultSource } from '../sensors/sources';
import { useSessions } from '../state/SessionsContext';
import { useSettings } from '../state/SettingsContext';
import { colors, radius, spacing, type } from '../theme/theme';
import { confirm } from '../utils/confirm';
import { shareText } from '../utils/share';
import { formatDuration } from '../utils/time';

const KEEP_AWAKE_TAG = 'pupg-workout';

/** How long a coaching message stays up after the frame that produced it. */
const COACH_STICKY_MS = 2200;

/** Translation key for what to tell the user when the analyser rejects a rep. */
const COACH_KEY = {
  [ISSUES.LOST_TRACKING]: 'coach.lostTracking',
  [ISSUES.NOT_HORIZONTAL]: 'coach.notHorizontal',
  [ISSUES.BODY_SAG]: 'coach.bodySag',
  [ISSUES.SHALLOW]: 'coach.shallow',
};

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
 * -> rest -> countdown -> ... -> saved.
 *
 * @param {object|null} plan   what to do: null (free), { kind: 'test' } or a
 *                             program day from src/program/program.js
 * @param {Function} onClearPlan     the plan was finished or dismissed
 * @param {Function} onStatusChange  so the shell can hide the tabs mid-set
 * @param {Function} onCelebrate     toasts for the goal and new achievements
 * @param {object}   controlsRef     lets the shell pause on the back button
 */
export function WorkoutScreen({ plan, onClearPlan, onStatusChange, onCelebrate, controlsRef }) {
  const { t, speechTag } = useI18n();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useSettings();
  const {
    sessions,
    stats,
    achievements,
    program,
    addSession,
    startProgram,
    completeProgramDay,
  } = useSessions();

  const [status, setStatus] = useState('idle');
  const [reps, setReps] = useState(0);
  const [completedSets, setCompletedSets] = useState([]);
  const [restOver, setRestOver] = useState(false);
  const [summary, setSummary] = useState(null);
  const [notice, setNotice] = useState(null);
  const [coach, setCoach] = useState(null);

  const [source, setSource] = useState(null);
  const [sourceConfig, setSourceConfig] = useState(null);
  const [availableSourceIds, setAvailableSourceIds] = useState([]);

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

  // Everything the async handlers (camera messages, timers) read is mirrored
  // here so a closure can never save a stale count.
  const live = useRef(freshLive());

  const timerStatus = status === 'active' ? 'active' : status === 'paused' ? 'paused' : 'idle';
  const { elapsedSeconds, readElapsedMs, reset: resetTimer } = useWorkoutTimer(timerStatus);
  const { repFeedback, controlFeedback, tickFeedback, goFeedback, doneFeedback } = useFeedback(
    settings,
    speechTag,
  );

  const planSets = activePlan?.kind === 'day' ? activePlan.sets : null;
  const setIndex = completedSets.length; // 0-based index of the set in progress
  const currentTarget = planSets ? planSets[Math.min(setIndex, planSets.length - 1)] : null;
  const isLastSet = !!planSets && setIndex === planSets.length - 1;
  const restSeconds = activePlan?.kind === 'day' ? activePlan.restSeconds : settings.restSeconds;

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
      // A stored choice only wins if that hardware is still present.
      const storedIsUsable = settings.sourceId && available.includes(settings.sourceId);
      setSource(
        storedIsUsable ? getSourceById(settings.sourceId) : await resolveDefaultSource(),
      );
    })();
    return () => {
      cancelled = true;
    };
    // Runs once: the stored source is only a starting point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const handlePoseFrame = useCallback((frame) => {
    const now = Date.now();
    const key = COACH_KEY[frame.issues?.[0]] ?? null;

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
  }, []);

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
    resetTimer();
  }, [closeRest, resetTimer]);

  const finishWorkout = useCallback(async () => {
    closeRest();
    const sets = live.current.sets;
    const totalReps = sets.reduce((sum, s) => sum + s.reps, 0);
    const durationSeconds = sets.reduce((sum, s) => sum + s.durationSeconds, 0);
    const restTotal = Math.round(live.current.restSeconds);
    const followed = activePlan;

    setStatus('paused'); // stop counting immediately while the write happens

    // A workout with no reps is not a workout — persisting it would dirty the
    // history list and the averages without recording anything real.
    if (totalReps === 0) {
      resetWorkout();
      setNotice({ tone: 'warn', text: t('notice.nothingSaved') });
      if (followed) onClearPlan?.();
      return;
    }

    doneFeedback(t('voice.done'));

    const goal = settings.dailyGoal;
    const todayBefore = stats.todayReps;
    const achievementsBefore = achievements;

    const session = await addSession({
      totalReps,
      durationSeconds,
      sourceId: source?.id,
      sets,
      restSeconds: restTotal,
      program: followed?.kind === 'day' ? { level: followed.level, day: followed.day } : null,
    });

    let completedDays = program?.completedDays ?? {};
    let level = null;
    if (followed?.kind === 'day') {
      await completeProgramDay(followed.day);
      completedDays = { ...completedDays, [followed.day]: Date.now() };
    } else if (followed?.kind === 'test') {
      level = (await startProgram(totalReps)).level;
      completedDays = {};
    }

    const celebrations = [];
    if (goal > 0 && todayBefore < goal && todayBefore + totalReps >= goal) {
      celebrations.push(t('notice.goalReached'));
    }
    const achievementsAfter = unlockedAchievements([session, ...sessions], completedDays);
    for (const id of newlyUnlocked(achievementsBefore, achievementsAfter)) {
      celebrations.push(t('notice.achievement', { name: t(`ach.${id}.title`) }));
    }

    resetWorkout();
    setSummary({
      kind: followed?.kind ?? 'free',
      day: followed?.day,
      level,
      totalReps,
      sets: sets.length,
      durationSeconds,
    });
    setNotice({
      tone: 'ok',
      text: level
        ? t('notice.levelAssigned', { level })
        : t('notice.saved', { reps: totalReps, time: formatDuration(durationSeconds) }),
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
    source,
    program,
    completeProgramDay,
    startProgram,
    sessions,
    onCelebrate,
  ]);

  const { isNear, onTouchStart, onTouchEnd, reset: resetDetector } = useRepDetector({
    source,
    sourceConfig,
    active: status === 'active',
    onRep: () => handleRepRef.current?.(),
  });

  const activate = useCallback(() => {
    goFeedback(isLastSet ? t('voice.lastSet') : t('voice.go'));
    resetDetector();
    setStatus('active');
  }, [goFeedback, isLastSet, t, resetDetector]);

  const beginSet = useCallback(() => {
    closeRest();
    live.current.reps = 0;
    setReps(0);
    setRestOver(false);
    setCoach(null);
    resetTimer();
    resetDetector();
    if (settings.countdownSeconds > 0) setStatus('countdown');
    else activate();
  }, [closeRest, resetTimer, resetDetector, settings.countdownSeconds, activate]);

  const endSet = useCallback(() => {
    const setReps_ = live.current.reps;
    // Done without a single rep means done with the workout.
    if (setReps_ === 0) {
      finishWorkout();
      return;
    }
    const durationSeconds = Math.round(readElapsedMs() / 1000);
    const done = [...live.current.sets, { reps: setReps_, durationSeconds }];
    live.current.sets = done;
    setCompletedSets(done);

    // The last program set, or the single set of the max test, ends the workout.
    if ((planSets && done.length >= planSets.length) || activePlan?.kind === 'test') {
      finishWorkout();
      return;
    }
    doneFeedback(t('voice.rest'));
    live.current.restStartedAt = Date.now();
    setRestOver(false);
    setStatus('rest');
  }, [finishWorkout, readElapsedMs, planSets, activePlan, doneFeedback, t]);

  const handleRep = useCallback(() => {
    const next = live.current.reps + 1;
    live.current.reps = next;
    setReps(next);
    repFeedback(next);
    // A program set with a fixed target completes itself; the max set never
    // does, since "as many as you can" is only over when you say so.
    if (currentTarget && !currentTarget.max && next >= currentTarget.target) endSet();
  }, [repFeedback, currentTarget, endSet]);

  const handleRepRef = useRef(handleRep);
  useEffect(() => {
    handleRepRef.current = handleRep;
  }, [handleRep]);

  const countdownRemaining = useCountdown({
    seconds: status === 'rest' ? restSeconds : settings.countdownSeconds,
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
  const start = useCallback(async () => {
    if (!source) return;
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
  }, [source, controlFeedback, t, beginSet]);

  const pause = useCallback(() => {
    controlFeedback();
    setStatus('paused');
  }, [controlFeedback]);

  const resume = useCallback(() => {
    controlFeedback();
    resetDetector();
    setStatus('active');
  }, [controlFeedback, resetDetector]);

  const skipCountdown = useCallback(() => {
    controlFeedback();
    activate();
  }, [controlFeedback, activate]);

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
      updateSettings({ sourceId: nextSource.id });
    },
    [status, controlFeedback, updateSettings],
  );

  const share = useCallback(() => {
    if (!summary) return;
    let text = t('share.text', {
      reps: summary.totalReps,
      time: formatDuration(summary.durationSeconds),
    });
    if (summary.sets > 1) text += t('share.sets', { sets: summary.sets });
    shareText(text);
  }, [summary, t]);

  // The shell's back-button handling: pause a running set instead of leaving.
  useEffect(() => {
    if (!controlsRef) return;
    controlsRef.current = {
      busy: status !== 'idle',
      pause: () => {
        if (status === 'active') pause();
      },
    };
  }, [controlsRef, status, pause]);

  // --- render --------------------------------------------------------------
  const selectableSources = useMemo(
    () => SOURCES.filter((s) => availableSourceIds.includes(s.id)),
    [availableSourceIds],
  );

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
  const setsDone = completedSets.length;
  const totalSets = planSets ? planSets.length : null;

  const planLine = (() => {
    if (activePlan?.kind === 'test') return t('workout.test');
    if (!planSets) return null;
    const idx = Math.min(setIndex, planSets.length - 1);
    const target = planSets[idx];
    const which = t('workout.set', { n: idx + 1, total: planSets.length });
    const goal = target.max
      ? t('workout.maxSet', { n: target.target })
      : t('workout.target', { n: target.target });
    return `${which} · ${goal}`;
  })();

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
          <Text style={styles.brandSub}>PUSH-UP</Text>
        </View>
        {activePlan?.kind === 'day' ? (
          <Text style={styles.headerPlan}>
            {t('workout.day', { day: activePlan.day, week: activePlan.week })}
          </Text>
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

      {/*
        Raw touch/pointer handlers rather than Pressable: Pressability inserts a
        press-responder stage before onPressIn (measured at ~69ms), which the
        detector would wrongly bill to the rep's hold time and reject fast reps.
        Touch and pointer handlers both fire immediately, and the detector
        ignores repeated same-state transitions, so double delivery is harmless.
      */}
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
      >
        {poseActive ? (
          <PoseStage
            active
            paused={status !== 'active'}
            onRep={() => handleRepRef.current?.()}
            onFrame={handlePoseFrame}
          />
        ) : null}

        {status === 'idle' && summary ? (
          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>
              {summary.kind === 'day'
                ? t('workout.summaryDay', { day: summary.day })
                : summary.kind === 'test'
                  ? t('workout.summaryTest')
                  : t('workout.summaryTitle')}
            </Text>
            <Text style={styles.summaryReps} allowFontScaling={false}>
              {summary.totalReps}
            </Text>
            <Text style={styles.summaryMeta}>
              {`${summary.sets} ${t('common.sets')} · ${formatDuration(summary.durationSeconds)}`}
            </Text>
            <Pressable
              onPress={share}
              hitSlop={8}
              accessibilityRole="button"
              style={({ pressed }) => [styles.shareBtn, pressed && styles.pressedDim]}
            >
              <Text style={styles.shareText}>{t('btn.share')}</Text>
            </Pressable>
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
                  {countdownRemaining || settings.countdownSeconds}
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
                  {t('workout.setDone', {
                    n: setsDone,
                    reps: completedSets[setsDone - 1]?.reps ?? 0,
                  })}
                </Text>
                <Text style={styles.stageHint}>
                  {planSets ? t('workout.nextIn') : t('workout.restHint')}
                </Text>
              </>
            ) : (
              <>
                <Text
                  style={styles.counter}
                  allowFontScaling={false}
                  accessibilityLabel={`${reps} ${t('common.reps')}`}
                >
                  {reps}
                </Text>
                <Text style={styles.timer} allowFontScaling={false}>
                  {formatDuration(elapsedSeconds)}
                </Text>
                {running && planLine ? <Text style={styles.subline}>{planLine}</Text> : null}
                {tapActive ? (
                  <Text style={styles.stageHint}>
                    {isNear ? t('workout.tapHold') : t('workout.tapTouch')}
                  </Text>
                ) : null}
              </>
            )}

            {poseActive && coach && status === 'active' ? (
              <View style={styles.coachPill}>
                <Text style={styles.coachText}>{t(coach)}</Text>
              </View>
            ) : null}
          </>
        )}
      </View>

      <Text
        style={[styles.notice, notice?.tone === 'warn' && styles.noticeWarn]}
        numberOfLines={3}
      >
        {notice
          ? notice.text
          : status === 'idle'
            ? activePlan?.kind === 'test'
              ? t('workout.testHint')
              : t(source.hintKey)
            : ' '}
      </Text>

      {status === 'idle' && planSets ? (
        <View style={styles.planCard}>
          <Text style={styles.planSets}>
            {planSets.map((s) => (s.max ? `${s.target}+` : String(s.target))).join(' · ')}
          </Text>
          <Text style={styles.planRest}>
            {t('program.rest', { seconds: activePlan.restSeconds })}
          </Text>
          <Pressable onPress={() => onClearPlan?.()} hitSlop={8} accessibilityRole="button">
            <Text style={styles.planCancel}>{t('btn.cancelPlan')}</Text>
          </Pressable>
        </View>
      ) : status === 'idle' && activePlan?.kind === 'test' ? (
        <View style={styles.planCard}>
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
              activePlan?.kind === 'day'
                ? t('btn.startDay', { day: activePlan.day })
                : activePlan?.kind === 'test'
                  ? t('btn.startTest')
                  : t('btn.start')
            }
            onPress={start}
            style={styles.grow}
          />
        ) : null}

        {status === 'calibrating' ? (
          <Button label={t('btn.calibrating')} onPress={() => {}} disabled style={styles.grow} />
        ) : null}

        {status === 'countdown' ? (
          <>
            <Button label={t('common.cancel')} variant="secondary" onPress={finish} style={styles.grow} />
            <View style={styles.gap} />
            <Button label={t('btn.skip')} onPress={skipCountdown} style={styles.grow} />
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
        {status === 'paused' ? (
          <Pressable onPress={confirmDiscard} hitSlop={8} accessibilityRole="button">
            <Text style={styles.discard}>{t('btn.discard')}</Text>
          </Pressable>
        ) : running && (totalSets || setsDone > 0) ? (
          <View style={styles.dots} accessibilityLabel={t('workout.set', { n: setIndex + 1, total: totalSets ?? setIndex + 1 })}>
            {Array.from({ length: totalSets ?? setsDone + 1 }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i < setsDone && styles.dotDone,
                  i === setsDone && status !== 'rest' && styles.dotCurrent,
                ]}
              />
            ))}
          </View>
        ) : null}
      </View>
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
  brandSub: { ...type.label, color: colors.textFaint, marginTop: -2 },
  headerPlan: { ...type.label, color: colors.accent },

  statsRow: { flexDirection: 'row' },
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
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(10,10,11,0.82)',
    borderWidth: 1,
    borderColor: colors.warn,
  },
  coachText: { ...type.label, color: colors.warn },

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

  notice: {
    ...type.body,
    color: colors.textDim,
    textAlign: 'center',
    minHeight: 40,
    marginBottom: spacing.sm,
  },
  noticeWarn: { color: colors.warn },

  planCard: { alignItems: 'center', marginBottom: spacing.md },
  planSets: { fontSize: 18, fontWeight: '600', color: colors.text, letterSpacing: 1 },
  planRest: { fontSize: 13, color: colors.textDim, marginTop: 2 },
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
  footer: { height: 44, alignItems: 'center', justifyContent: 'center' },
  discard: { fontSize: 14, color: colors.danger },
  dots: { flexDirection: 'row', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotDone: { backgroundColor: colors.accent },
  dotCurrent: { borderWidth: 1, borderColor: colors.accent, backgroundColor: 'transparent' },
});
