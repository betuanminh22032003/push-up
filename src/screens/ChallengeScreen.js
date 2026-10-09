import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  CHALLENGE_COUNTDOWN_SECONDS,
  DEFAULT_DURATION,
  RANKED_SOURCE,
  challengeRecord,
  compareScores,
  createChallengeRun,
  formatsFor,
  isPlayable,
} from '../challenge/challenge';
import { challengeWebUrl, cleanName, encodeChallenge, randomChallengeId } from '../challenge/codec';
import { Button } from '../components/Button';
import { CameraSetupGuide } from '../components/CameraSetupGuide';
import { ExerciseLibraryButton } from '../components/ExerciseLibrary';
import { Chips } from '../components/SettingsRows';
import { VisibilityPill } from '../components/VisibilityPill';
import { getExercise } from '../exercises/exercises';
import { useFeedback } from '../hooks/useFeedback';
import { useI18n } from '../i18n/I18nContext';
import { PoseStage } from '../pose/PoseStage';
import { useBlocker } from '../state/BlockerContext';
import { useChallenges } from '../state/ChallengesContext';
import { useSessions } from '../state/SessionsContext';
import { useSettings } from '../state/SettingsContext';
import { colors, font, radius, spacing, textGlow, type } from '../theme/theme';
import { shareText } from '../utils/share';
import { formatDuration } from '../utils/time';
import { ExerciseGlyph } from '../components/ExerciseGlyph';
import { Icon } from '../components/Icon';

const KEEP_AWAKE_TAG = 'pupg-challenge';
/** A hold says its count only every this many seconds, as in a workout. */
const HOLD_SPEAK_EVERY = 10;
/** How often the clock on screen is refreshed. */
const TICK_MS = 200;

/**
 * Timed challenges, as a full-screen sheet over the tabs.
 *
 *   new challenge: setup (exercise, format) -> guide -> run -> result
 *   from a link:   invite (who, what, score to beat) -> guide -> run -> result
 *
 * Only the camera counts here: a ranked score someone else has to beat must
 * not come from tapping the screen. The run itself is
 * src/challenge/challenge.js; this screen feeds it reps and the time.
 * A finished run is saved as an ordinary session (and earns fun time like
 * one), and goes into the local list of challenges.
 *
 * @param {object|null} request  null (closed), { mode: 'new', exerciseId },
 *                               or { mode: 'received', challenge } (decoded)
 * @param {Function}    onClose
 */
export function ChallengeScreen({ request, onClose }) {
  const visible = !!request;
  // Back goes through the flow's own close, which stops and scores a run in
  // progress instead of throwing it away.
  const closeRef = useRef(null);
  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={() => (closeRef.current ? closeRef.current() : onClose?.())}
      statusBarTranslucent
    >
      {visible ? (
        <ChallengeFlow
          // A different challenge is a different flow: nothing carries over.
          key={request.challenge?.id ?? `new-${request.exerciseId ?? ''}`}
          request={request}
          onClose={onClose}
          closeRef={closeRef}
        />
      ) : null}
    </Modal>
  );
}

function ChallengeFlow({ request, onClose, closeRef }) {
  const { t, speechTag } = useI18n();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useSettings();
  const { addSession } = useSessions();
  const { addRecord } = useChallenges();
  const { creditReps } = useBlocker();
  const { repFeedback, tickFeedback, goFeedback, doneFeedback } = useFeedback(settings, speechTag);

  const received = request.mode === 'received' ? request.challenge : null;
  const [phase, setPhase] = useState(received ? 'invite' : 'setup');
  const [exerciseId, setExerciseId] = useState(
    received ? received.exerciseId : request.exerciseId || settings.exerciseId,
  );
  const [duration, setDuration] = useState(received ? received.durationSeconds : DEFAULT_DURATION);
  const exercise = getExercise(exerciseId);
  const hold = exercise.kind === 'hold';
  const rules = hold
    ? { format: 'hold', durationSeconds: 0 }
    : { format: 'reps', durationSeconds: duration };

  // --- the run ----------------------------------------------------------------
  const runRef = useRef(null);
  // The clock and Stop can both end a run in the same moment; it ends once.
  const finishedRef = useRef(false);
  const [visibility, setVisibility] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [started, setStarted] = useState(false);
  const [live, setLive] = useState({ score: 0, remaining: null, elapsed: 0 });
  const [resetKey, setResetKey] = useState(0);
  const [poseBlocked, setPoseBlocked] = useState(false);
  const [result, setResult] = useState(null);
  const [nameDraft, setNameDraft] = useState(settings.challengeName ?? '');

  const beginRun = useCallback(() => {
    runRef.current = createChallengeRun(rules);
    finishedRef.current = false;
    setVisibility(null);
    setCountdown(null);
    setStarted(false);
    setLive({ score: 0, remaining: rules.durationSeconds || null, elapsed: 0 });
    setResult(null);
    setPhase('run');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules.format, rules.durationSeconds]);

  useEffect(() => {
    if (phase === 'run') activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    else deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [phase]);

  // The countdown starts once the camera has seen the whole body.
  useEffect(() => {
    if (phase === 'run' && visibility?.ready && countdown === null && !started) {
      setCountdown(CHALLENGE_COUNTDOWN_SECONDS);
    }
  }, [phase, visibility, countdown, started]);

  useEffect(() => {
    if (phase !== 'run' || countdown === null || started) return undefined;
    if (countdown === 0) {
      runRef.current?.start(Date.now());
      setResetKey((k) => k + 1); // the count starts from zero with the clock
      setStarted(true);
      goFeedback(t('voice.go'));
      return undefined;
    }
    tickFeedback();
    const id = setTimeout(() => setCountdown((c) => (c === null ? c : c - 1)), 1000);
    return () => clearTimeout(id);
  }, [phase, countdown, started, goFeedback, tickFeedback, t]);

  const finish = useCallback(
    async (snapshot) => {
      const run = runRef.current;
      if (!run || finishedRef.current) return;
      finishedRef.current = true;
      const score = snapshot.score;
      const durationSeconds = run.durationSeconds();
      const outcome = received ? compareScores(score, received.score) : null;
      setPhase('result');
      setResult({ score, durationSeconds, outcome, reason: snapshot.reason });
      doneFeedback(t('voice.done'));
      // Saved like any camera set, so it counts toward history, goals and badges.
      if (score > 0) {
        await addSession({
          totalReps: score,
          durationSeconds: Math.max(1, durationSeconds),
          sourceId: RANKED_SOURCE,
          exerciseId,
        });
        await creditReps(score, exercise.creditWeight);
      }
      if (received) await addRecord(challengeRecord('received', received, { myScore: score }));
    },
    [received, doneFeedback, t, addSession, exerciseId, creditReps, exercise.creditWeight, addRecord],
  );

  useEffect(() => {
    if (phase !== 'run' || !started) return undefined;
    const id = setInterval(() => {
      const snapshot = runRef.current?.tick(Date.now());
      if (!snapshot) return;
      setLive(snapshot);
      if (snapshot.over) finish(snapshot);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [phase, started, finish]);

  const onRep = useCallback(() => {
    const run = runRef.current;
    if (!run || !run.rep(Date.now())) return;
    const score = run.score;
    setLive((prev) => ({ ...prev, score }));
    if (!hold || score % HOLD_SPEAK_EVERY === 0) repFeedback(score);
  }, [hold, repFeedback]);

  const stop = useCallback(() => {
    const run = runRef.current;
    if (!run) return;
    if (!run.started) {
      // Nothing to score yet: back to the guide rather than a result of zero.
      setPhase('guide');
      return;
    }
    run.stop(Date.now());
    finish(run.tick(Date.now()));
  }, [finish]);

  // --- sharing ------------------------------------------------------------------
  const askName = settings.challengeName === null;
  const share = useCallback(() => {
    if (!result) return;
    const name = cleanName(askName ? nameDraft : settings.challengeName);
    if (askName) updateSettings({ challengeName: name });
    const mine = {
      exerciseId,
      format: rules.format,
      durationSeconds: rules.durationSeconds,
      name,
      score: result.score,
      at: Date.now(),
      id: randomChallengeId(),
      replyTo: received?.id ?? null,
    };
    const url = challengeWebUrl(encodeChallenge(mine));
    const params = {
      name: name || t('challenge.someone'),
      score: result.score,
      exercise: t(`exercise.${exerciseId}.noun`),
      seconds: rules.durationSeconds,
    };
    const text = t(
      received ? 'challenge.shareRematch' : hold ? 'challenge.shareHold' : 'challenge.shareReps',
      { ...params, opponent: received?.name || t('challenge.someone') },
    );
    shareText(`${text}\n${url}`);
    addRecord(challengeRecord('sent', mine));
  }, [result, askName, nameDraft, settings.challengeName, updateSettings, exerciseId, rules.format, rules.durationSeconds, received, t, hold, addRecord]);

  const handleClose = useCallback(() => {
    if (phase === 'run' && runRef.current?.started) {
      stop();
      return;
    }
    onClose?.();
  }, [phase, stop, onClose]);
  useEffect(() => {
    if (!closeRef) return undefined;
    closeRef.current = handleClose;
    return () => {
      closeRef.current = null;
    };
  }, [closeRef, handleClose]);

  // --- render ---------------------------------------------------------------------
  const exerciseName = t(`exercise.${exerciseId}`);
  const goalText = (challenge) =>
    challenge.format === 'hold'
      ? t('challenge.goalHold', { score: challenge.score })
      : t('challenge.goalReps', { score: challenge.score, seconds: challenge.durationSeconds });

  let body;
  if (phase === 'setup') {
    const formats = formatsFor(exerciseId);
    body = (
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{t('challenge.newTitle')}</Text>
        <Text style={styles.lead}>{t('challenge.newBody')}</Text>
        <Text style={styles.label}>{t('challenge.exercise')}</Text>
        <ExerciseLibraryButton selected={exerciseId} onSelect={setExerciseId} />
        <Text style={styles.label}>{t('challenge.format')}</Text>
        {hold ? (
          <Text style={styles.formatText}>{t('challenge.formatHold')}</Text>
        ) : (
          <Chips
            options={formats.map((f) => ({ id: f.durationSeconds, label: t('challenge.formatReps', { seconds: f.durationSeconds }) }))}
            selected={duration}
            onSelect={setDuration}
          />
        )}
        <View style={styles.ruleRow}>
          <Icon name="camera-outline" size={16} color={colors.textDim} />
          <Text style={[styles.rule, styles.ruleText]}>{t('challenge.rule')}</Text>
        </View>
        <Button label={t('challenge.next')} onPress={() => setPhase('guide')} style={styles.button} />
        <Button label={t('common.cancel')} variant="secondary" onPress={onClose} style={styles.buttonSmall} />
      </ScrollView>
    );
  } else if (phase === 'invite') {
    const playable = isPlayable(received);
    body = (
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{t('challenge.inviteTitle', { name: received.name || t('challenge.someone') })}</Text>
        <View style={styles.inviteCard}>
          {playable ? (
            <ExerciseGlyph exerciseId={exercise.id} size={64} />
          ) : (
            <Icon name="help-circle-outline" size={56} color={colors.textDim} />
          )}
          <Text style={styles.inviteExercise}>{playable ? exerciseName : received.exerciseId}</Text>
          <Text style={styles.inviteScore}>{received.score}</Text>
          <Text style={styles.inviteGoal}>{goalText(received)}</Text>
          <Text style={styles.inviteDate}>{new Date(received.at).toLocaleDateString(speechTag)}</Text>
        </View>
        {playable ? (
          <>
            <View style={styles.ruleRow}>
          <Icon name="camera-outline" size={16} color={colors.textDim} />
          <Text style={[styles.rule, styles.ruleText]}>{t('challenge.rule')}</Text>
        </View>
            <Button label={t('challenge.accept')} onPress={() => setPhase('guide')} style={styles.button} />
          </>
        ) : (
          <Text style={styles.warn}>{t('challenge.unplayable')}</Text>
        )}
        <Button label={t('challenge.later')} variant="secondary" onPress={onClose} style={styles.buttonSmall} />
      </ScrollView>
    );
  } else if (phase === 'guide') {
    body = (
      <ScrollView contentContainerStyle={styles.scroll}>
        <CameraSetupGuide
          exerciseId={exerciseId}
          onStart={beginRun}
          onCancel={() => setPhase(received ? 'invite' : 'setup')}
          cancelLabel={t('common.back')}
        />
      </ScrollView>
    );
  } else if (phase === 'run') {
    const clock = hold ? formatDuration(live.elapsed) : formatDuration(live.remaining ?? rules.durationSeconds);
    body = (
      <View style={styles.runWrap}>
        <Text style={styles.runTitle} numberOfLines={1}>
          {exerciseName} · {hold ? t('challenge.formatHold') : t('challenge.formatReps', { seconds: rules.durationSeconds })}
        </Text>
        {received ? <Text style={styles.runBeat}>{t('challenge.toBeat', { score: received.score })}</Text> : null}
        <View style={styles.stage}>
          <PoseStage
            active
            exercise={exerciseId}
            paused={!started}
            onRep={onRep}
            onVisibility={setVisibility}
            resetKey={resetKey}
            onBlockingChange={setPoseBlocked}
          />
          <VisibilityPill visibility={visibility} />
          <View style={[styles.stageCenter, poseBlocked && styles.hidden]} pointerEvents="none">
            {started ? (
              <>
                <Text style={styles.score} allowFontScaling={false}>{live.score}</Text>
                <Text style={styles.clock} allowFontScaling={false}>{clock}</Text>
              </>
            ) : countdown !== null ? (
              <Text style={styles.score} allowFontScaling={false}>{countdown || '0'}</Text>
            ) : null}
          </View>
        </View>
        <Button
          label={started ? t('challenge.stop') : t('common.cancel')}
          variant="secondary"
          onPress={stop}
          style={styles.button}
        />
      </View>
    );
  } else {
    const outcome = result?.outcome;
    body = (
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{outcome ? t(`challenge.outcome.${outcome}`) : t('challenge.resultTitle')}</Text>
        <View style={styles.inviteCard}>
          <ExerciseGlyph exerciseId={exercise.id} size={64} />
          <Text style={styles.inviteExercise}>{exerciseName}</Text>
          <Text style={styles.inviteScore}>{result?.score ?? 0}</Text>
          <Text style={styles.inviteGoal}>{hold ? t('common.secs') : t('common.reps')}</Text>
          {received ? (
            <Text style={styles.versus}>
              {t('challenge.versus', { name: received.name || t('challenge.someone'), score: received.score })}
            </Text>
          ) : null}
        </View>
        {result?.score ? (
          <>
            {askName ? (
              <>
                <Text style={styles.label}>{t('challenge.nameLabel')}</Text>
                <TextInput
                  value={nameDraft}
                  onChangeText={setNameDraft}
                  maxLength={24}
                  placeholder={t('challenge.namePlaceholder')}
                  placeholderTextColor={colors.textFaint}
                  style={styles.input}
                  accessibilityLabel={t('challenge.nameLabel')}
                />
                <Text style={styles.small}>{t('challenge.nameNote')}</Text>
              </>
            ) : null}
            <Button
              label={received ? t('challenge.rematch') : t('challenge.shareFriends')}
              onPress={share}
              style={styles.button}
            />
            <Text style={styles.small}>{t('challenge.linkNote')}</Text>
          </>
        ) : (
          <Text style={styles.warn}>{t('challenge.noScore')}</Text>
        )}
        <Button label={t('challenge.again')} variant="secondary" onPress={() => setPhase('guide')} style={styles.buttonSmall} />
        <Button label={t('challenge.done')} variant="secondary" onPress={onClose} style={styles.buttonSmall} />
      </ScrollView>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.md }]}>
      {phase === 'run' ? null : (
        <Pressable onPress={handleClose} hitSlop={12} style={styles.close} accessibilityRole="button" accessibilityLabel={t('common.close')}>
          <Icon name="close" size={26} color={colors.textDim} />
        </Pressable>
      )}
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  ruleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.lg },
  ruleText: { flex: 1, marginTop: 0 },
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  // Clear of the close button, which sits over the top right corner.
  scroll: { paddingTop: spacing.xl, paddingBottom: spacing.xl },
  close: { position: 'absolute', top: spacing.xl + spacing.md, right: spacing.lg, zIndex: 10 },
  title: { ...type.title, color: colors.text, paddingRight: spacing.xl },
  lead: { ...type.body, color: colors.textDim, marginTop: spacing.sm, lineHeight: 21 },
  label: { ...type.label, fontSize: 13, color: colors.textDim, marginTop: spacing.lg, marginBottom: spacing.sm },
  formatText: { ...type.body, color: colors.text },
  rule: { ...font('400'), fontSize: 13, color: colors.textDim, marginTop: spacing.lg, lineHeight: 19 },
  warn: { ...type.body, color: colors.warn, marginTop: spacing.lg, textAlign: 'center' },
  small: { ...font('400'), fontSize: 12, color: colors.textFaint, marginTop: spacing.sm, lineHeight: 17 },
  button: { marginTop: spacing.lg },
  buttonSmall: { marginTop: spacing.sm },
  inviteCard: {
    marginTop: spacing.lg,
    alignItems: 'center',
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  inviteExercise: { ...type.body, ...font('600'), color: colors.text, marginTop: spacing.xs },
  inviteScore: { fontSize: 72, ...font('200'), color: colors.accent },
  inviteGoal: { ...type.body, color: colors.textDim, textAlign: 'center', paddingHorizontal: spacing.md },
  inviteDate: { ...font('400'), fontSize: 12, color: colors.textFaint, marginTop: spacing.sm },
  versus: { ...type.body, color: colors.text, marginTop: spacing.md },
  input: {
    ...font('400'),
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    fontSize: 16,
  },
  runWrap: { flex: 1 },
  runTitle: { ...type.body, ...font('600'), color: colors.text, textAlign: 'center' },
  runBeat: { ...font('400'), fontSize: 13, color: colors.accent, textAlign: 'center', marginTop: 2 },
  stage: {
    flex: 1,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  stageCenter: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  score: { ...type.counter, color: colors.text, ...textGlow(2, 12) },
  clock: { ...type.timer, color: colors.text, marginTop: -spacing.sm, ...textGlow(2, 12) },
  hidden: { display: 'none' },
});
