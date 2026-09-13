import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { Button } from '../components/Button';
import { StatTile } from '../components/StatTile';
import { HistoryModal } from './HistoryModal';
import { useFeedback } from '../hooks/useFeedback';
import { useRepDetector } from '../hooks/useRepDetector';
import { useSessions } from '../hooks/useSessions';
import { useWorkoutTimer } from '../hooks/useWorkoutTimer';
import { SOURCES, getSourceById, resolveDefaultSource } from '../sensors/sources';
import { loadSettings, saveSettings } from '../storage/sessions';
import { colors, radius, spacing, type } from '../theme/theme';
import { formatDuration } from '../utils/time';

const KEEP_AWAKE_TAG = 'pupg-workout';

const STATUS_META = {
  idle: { label: 'IDLE', color: colors.textDim },
  calibrating: { label: 'CALIBRATING', color: colors.warn },
  active: { label: 'ACTIVE', color: colors.accent },
  paused: { label: 'PAUSED', color: colors.warn },
};

export function WorkoutScreen() {
  const [status, setStatus] = useState('idle');
  const [reps, setReps] = useState(0);
  const [historyVisible, setHistoryVisible] = useState(false);

  const [source, setSource] = useState(null);
  const [sourceConfig, setSourceConfig] = useState(null);
  const [availableSourceIds, setAvailableSourceIds] = useState([]);
  const [notice, setNotice] = useState(null);

  const [settings, setSettings] = useState({ soundEnabled: true, hapticsEnabled: true });

  const { sessions, stats, addSession, removeSession, removeAll } = useSessions();
  const timerStatus = status === 'active' ? 'active' : status === 'paused' ? 'paused' : 'idle';
  const { elapsedSeconds, readElapsedMs, reset: resetTimer } = useWorkoutTimer(timerStatus);
  const { repFeedback, controlFeedback, finishFeedback } = useFeedback(settings);

  // Reps are read inside async finish handlers, so mirror them into a ref to
  // avoid saving a stale count captured by a closure.
  const repsRef = useRef(0);
  useEffect(() => {
    repsRef.current = reps;
  }, [reps]);

  const handleRep = useCallback(() => {
    setReps((n) => n + 1);
    repFeedback();
  }, [repFeedback]);

  const { isNear, onTouchStart, onTouchEnd, reset: resetDetector } = useRepDetector({
    source,
    sourceConfig,
    active: status === 'active',
    onRep: handleRep,
  });

  // --- startup: settings + which input this device can actually use ---------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await loadSettings();
      const available = [];
      for (const candidate of SOURCES) {
        if (await candidate.isAvailableAsync()) available.push(candidate.id);
      }
      if (cancelled) return;

      setSettings(stored);
      setAvailableSourceIds(available);

      // A stored choice only wins if that hardware is still present.
      const storedIsUsable = stored.sourceId && available.includes(stored.sourceId);
      setSource(storedIsUsable ? getSourceById(stored.sourceId) : await resolveDefaultSource());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // --- keep the screen on for the duration of a set ------------------------
  useEffect(() => {
    if (status === 'active' || status === 'calibrating') {
      activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    } else {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    }
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [status]);

  const persistSettings = useCallback((patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const selectSource = useCallback(
    (nextSource) => {
      if (status !== 'idle') return;
      controlFeedback();
      setSource(nextSource);
      setSourceConfig(null);
      setNotice(null);
      persistSettings({ sourceId: nextSource.id });
    },
    [status, controlFeedback, persistSettings],
  );

  // --- controls ------------------------------------------------------------
  const start = useCallback(async () => {
    if (!source) return;
    controlFeedback();
    setNotice(null);

    // Light-based detection needs to know what "uncovered" looks like in this
    // room before it can recognise "covered".
    if (source.calibrateAsync) {
      setStatus('calibrating');
      const result = await source.calibrateAsync();
      if (!result.ok) {
        setStatus('idle');
        setNotice({ tone: 'warn', text: result.message });
        return;
      }
      setSourceConfig(result);
      setNotice({ tone: 'ok', text: result.message });
    }

    resetDetector();
    setStatus('active');
  }, [source, controlFeedback, resetDetector]);

  const pause = useCallback(() => {
    controlFeedback();
    setStatus('paused');
  }, [controlFeedback]);

  const resume = useCallback(() => {
    controlFeedback();
    resetDetector();
    setStatus('active');
  }, [controlFeedback, resetDetector]);

  const resetWorkout = useCallback(() => {
    setStatus('idle');
    setReps(0);
    repsRef.current = 0;
    resetTimer();
    resetDetector();
  }, [resetTimer, resetDetector]);

  const finish = useCallback(async () => {
    const totalReps = repsRef.current;
    const durationSeconds = Math.round(readElapsedMs() / 1000);

    setStatus('paused'); // stop counting immediately while the write happens

    // A set with no reps is not a workout — persisting it would dirty the
    // history list and the averages without recording anything real.
    if (totalReps === 0) {
      resetWorkout();
      setNotice({ tone: 'warn', text: 'No reps counted, nothing saved.' });
      return;
    }

    finishFeedback();
    await addSession({ totalReps, durationSeconds, sourceId: source?.id });
    resetWorkout();
    setNotice({
      tone: 'ok',
      text: `Saved ${totalReps} reps in ${formatDuration(durationSeconds)}.`,
    });
  }, [readElapsedMs, addSession, source, finishFeedback, resetWorkout]);

  const confirmDiscard = useCallback(() => {
    Alert.alert('Discard this set?', `${reps} reps will not be saved.`, [
      { text: 'Keep going', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: resetWorkout },
    ]);
  }, [reps, resetWorkout]);

  // --- render --------------------------------------------------------------
  if (!source) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  const statusMeta = STATUS_META[status];
  const tapActive = !!source.isTapDriven && status === 'active';
  const selectableSources = SOURCES.filter((s) => availableSourceIds.includes(s.id));

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>PUPG</Text>
          <Text style={styles.brandSub}>PUSH-UP</Text>
        </View>
        <Pressable
          onPress={() => {
            controlFeedback();
            setHistoryVisible(true);
          }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Open history"
          style={({ pressed }) => [styles.historyBtn, pressed && styles.pressedDim]}
        >
          <Text style={styles.historyBtnText}>History</Text>
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <StatTile label="Total" value={stats.totalReps} />
        <View style={styles.gap} />
        <StatTile label="Today" value={stats.todayReps} highlight />
        <View style={styles.gap} />
        <StatTile
          label="Streak"
          value={stats.streak}
          suffix={stats.streak === 1 ? 'day' : 'days'}
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
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onPointerDown={onTouchStart}
        onPointerUp={onTouchEnd}
        onPointerCancel={onTouchEnd}
        accessible={tapActive}
        accessibilityRole={tapActive ? 'button' : undefined}
        accessibilityLabel={tapActive ? `Tap to count a rep. ${reps} counted.` : undefined}
      >
        <View style={[styles.statusPill, { borderColor: statusMeta.color }]}>
          <View style={[styles.statusDot, { backgroundColor: statusMeta.color }]} />
          <Text style={[styles.statusText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
        </View>

        <Text style={styles.counter} allowFontScaling={false} accessibilityLabel={`${reps} reps`}>
          {reps}
        </Text>

        <Text style={styles.timer} allowFontScaling={false}>
          {formatDuration(elapsedSeconds)}
        </Text>

        {tapActive ? (
          <Text style={styles.stageHint}>
            {isNear ? 'HOLD, THEN RELEASE' : 'TOUCH TO COUNT'}
          </Text>
        ) : null}
      </View>

      <Text
        style={[styles.notice, notice?.tone === 'warn' && styles.noticeWarn]}
        numberOfLines={3}
      >
        {notice ? notice.text : status === 'idle' ? source.hint : ' '}
      </Text>

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
                  {candidate.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={styles.controls}>
        {status === 'idle' ? <Button label="Start" onPress={start} style={styles.grow} /> : null}

        {status === 'calibrating' ? (
          <Button label="Calibrating..." onPress={() => {}} disabled style={styles.grow} />
        ) : null}

        {status === 'active' || status === 'paused' ? (
          <>
            <Button
              label={status === 'active' ? 'Pause' : 'Resume'}
              variant="secondary"
              onPress={status === 'active' ? pause : resume}
              style={styles.grow}
            />
            <View style={styles.gap} />
            <Button label="Finish" onPress={finish} style={styles.grow} />
          </>
        ) : null}
      </View>

      <View style={styles.footer}>
        {status === 'paused' ? (
          <Pressable onPress={confirmDiscard} hitSlop={8} accessibilityRole="button">
            <Text style={styles.discard}>Discard set</Text>
          </Pressable>
        ) : (
          <View style={styles.toggles}>
            <Toggle
              label="Sound"
              on={settings.soundEnabled}
              onPress={() => persistSettings({ soundEnabled: !settings.soundEnabled })}
            />
            <Toggle
              label="Haptics"
              on={settings.hapticsEnabled}
              onPress={() => persistSettings({ hapticsEnabled: !settings.hapticsEnabled })}
            />
          </View>
        )}
      </View>

      <HistoryModal
        visible={historyVisible}
        onClose={() => setHistoryVisible(false)}
        sessions={sessions}
        stats={stats}
        onDelete={removeSession}
        onClearAll={removeAll}
      />
    </SafeAreaView>
  );
}

function Toggle({ label, on, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.toggle, pressed && styles.pressedDim]}
    >
      <View style={[styles.toggleDot, on && styles.toggleDotOn]} />
      <Text style={[styles.toggleLabel, on && styles.toggleLabelOn]}>{label}</Text>
    </Pressable>
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
  historyBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  historyBtnText: { fontSize: 14, fontWeight: '600', color: colors.textDim },

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
  },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: spacing.sm },
  statusText: { ...type.label },

  counter: { ...type.counter, color: colors.text, marginTop: spacing.sm },
  timer: { ...type.timer, color: colors.textDim, marginTop: -spacing.sm },
  stageHint: { ...type.label, color: colors.textFaint, marginTop: spacing.lg },

  notice: {
    ...type.body,
    color: colors.textDim,
    textAlign: 'center',
    minHeight: 40,
    marginBottom: spacing.sm,
  },
  noticeWarn: { color: colors.warn },

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
  footer: { height: 54, alignItems: 'center', justifyContent: 'center' },
  discard: { fontSize: 14, color: colors.danger },
  toggles: { flexDirection: 'row', gap: spacing.xl },
  toggle: { flexDirection: 'row', alignItems: 'center' },
  toggleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
    backgroundColor: colors.textFaint,
  },
  toggleDotOn: { backgroundColor: colors.accent },
  toggleLabel: { fontSize: 13, color: colors.textFaint },
  toggleLabelOn: { color: colors.textDim },
});
