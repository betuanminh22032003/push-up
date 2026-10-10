import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ACHIEVEMENTS, longestStreak } from '../achievements/achievements';
import { AchievementGrid } from '../components/AchievementGrid';
import { ExercisePicker } from '../components/ExercisePicker';
import { ProgressBar } from '../components/ProgressBar';
import { SessionRow } from '../components/SessionRow';
import { StatTile } from '../components/StatTile';
import { WeeklyChart } from '../components/WeeklyChart';
import { EXERCISES, exerciseOf, filterByExercise, getExercise, isHold, isHoldSession } from '../exercises/exercises';
import { useI18n, useT } from '../i18n/I18nContext';
import { useChallenges } from '../state/ChallengesContext';
import { useSessions } from '../state/SessionsContext';
import { useSettings } from '../state/SettingsContext';
import { colors, font, spacing, type } from '../theme/theme';
import { confirm } from '../utils/confirm';
import { computeStats, dailyTotals } from '../utils/stats';
import { formatDuration, formatSessionDate } from '../utils/time';
import { MUSCLE_PARTS, weekTraining } from '../utils/weekly';

/**
 * Chart, records, badges, and every workout — the "why keep going" tab.
 *
 * Once the history holds more than one exercise, a filter narrows the tiles,
 * the chart, the records and the list to one of them. The daily goal counts
 * every exercise, so its bar and line only show under "All"; achievements
 * are global and never filtered.
 *
 * Under "All" the rep figures leave holds out (a plank's seconds are not
 * reps); filtered to a hold, every figure is in seconds held.
 */
export function ProgressScreen({ onOpenChallenge }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { sessions, stats, achievements, removeSession, today } = useSessions();
  const { records: challengeRecords } = useChallenges();
  const { settings } = useSettings();
  const [filter, setFilter] = useState('all');

  // The exercises that appear in the history, in the app's order.
  const inHistory = useMemo(() => {
    const ids = new Set(sessions.map(exerciseOf));
    return EXERCISES.filter((e) => ids.has(e.id));
  }, [sessions]);
  const showFilter = inHistory.length > 1;
  // A filter whose last session was deleted falls back to everything.
  const shown = showFilter && inHistory.some((e) => e.id === filter) ? filter : 'all';
  const all = shown === 'all';

  const filtered = useMemo(() => filterByExercise(sessions, shown), [sessions, shown]);
  const seconds = !all && isHold(shown);
  const options = useMemo(() => ({ isHold: isHoldSession, unit: seconds ? 'seconds' : 'reps' }), [seconds]);
  // `today` is in the dependencies so the figures move on at midnight.
  const shownStats = useMemo(
    () => (all ? stats : computeStats(filtered, Date.now(), options)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, stats, filtered, options, today],
  );
  const unit = seconds ? t('common.secs') : undefined;
  const goal = all ? settings.dailyGoal : 0;

  const week = useMemo(
    () => dailyTotals(filtered, 7, Date.now(), options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, options, today],
  );
  const weekTotal = week.reduce((sum, d) => sum + d.reps, 0);
  const streakRecord = useMemo(() => longestStreak(filtered), [filtered]);
  const training = useMemo(
    () => weekTraining(sessions, Date.now()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, today],
  );

  const confirmDelete = (session) => {
    confirm({
      title: t('confirm.deleteTitle'),
      message: t(isHoldSession(session) ? 'confirm.deleteBodyHold' : 'confirm.deleteBody', {
        reps: session.totalReps,
      }),
      confirmText: t('confirm.delete'),
      cancelText: t('common.cancel'),
      destructive: true,
      onConfirm: () => removeSession(session.id),
    });
  };

  const header = (
    <View>
      <Text style={styles.title}>{t('progress.title')}</Text>

      {showFilter ? (
        <ExercisePicker
          options={[
            { id: 'all', label: t('progress.filterAll') },
            ...inHistory.map((e) => ({ id: e.id, label: t(`exercise.${e.id}`) })),
          ]}
          selected={shown}
          onSelect={setFilter}
          label={t('progress.filter')}
          align="start"
          bleed={spacing.lg}
          style={styles.filter}
        />
      ) : null}

      <View style={styles.statsRow}>
        <StatTile label={t('stat.total')} value={shownStats.totalReps} suffix={unit} />
        <View style={styles.gap} />
        <StatTile
          label={t('stat.today')}
          value={shownStats.todayReps}
          suffix={unit}
          highlight
          progress={
            all
              ? {
                  value: stats.todayReps,
                  max: settings.dailyGoal,
                  caption: t('stat.goal', { goal: settings.dailyGoal }),
                }
              : undefined
          }
        />
        <View style={styles.gap} />
        <StatTile
          label={t('stat.streak')}
          value={shownStats.streak}
          suffix={shownStats.streak === 1 ? t('common.day') : t('common.days')}
        />
      </View>

      <View style={styles.sectionRow}>
        <Text style={styles.sectionLabel}>{t('progress.lastDays')}</Text>
        <Text style={styles.sectionMeta}>{t(seconds ? 'progress.weekTotalHold' : 'progress.weekTotal', { reps: weekTotal })}</Text>
      </View>
      <WeeklyChart days={week} goal={goal} />

      {all && sessions.length ? <WhoCard training={training} /> : null}

      <Text style={styles.sectionLabel}>{t('progress.records')}</Text>
      <View style={styles.statsRow}>
        <StatTile label={t('progress.bestSet')} value={shownStats.bestSet} suffix={unit} />
        <View style={styles.gap} />
        <StatTile label={t('progress.bestDay')} value={shownStats.bestDay} suffix={unit} />
        <View style={styles.gap} />
        <StatTile
          label={t('progress.longestStreak')}
          value={streakRecord}
          suffix={streakRecord === 1 ? t('common.day') : t('common.days')}
        />
      </View>
      <View style={[styles.statsRow, styles.statsRowGap]}>
        <StatTile label={t('progress.workouts')} value={shownStats.sessionCount} />
        <View style={styles.gap} />
        <StatTile label={t('progress.totalTime')} value={formatDuration(shownStats.totalSeconds)} />
      </View>

      <View style={styles.sectionRow}>
        <Text style={styles.sectionLabel}>{t('progress.achievements')}</Text>
        <Text style={styles.sectionMeta}>
          {t('progress.unlocked', { n: achievements.length, total: ACHIEVEMENTS.length })}
        </Text>
      </View>
      <AchievementGrid unlocked={achievements} />

      <View style={styles.sectionRow}>
        <Text style={styles.sectionLabel}>{t('challenge.listTitle')}</Text>
        <Pressable onPress={() => onOpenChallenge?.(null)} hitSlop={8} accessibilityRole="button">
          <Text style={styles.sectionAction}>{t('challenge.entry')}</Text>
        </Pressable>
      </View>
      {challengeRecords.length ? (
        challengeRecords.slice(0, CHALLENGES_SHOWN).map((record) => (
          <ChallengeRow key={record.id} record={record} />
        ))
      ) : (
        <Text style={styles.challengeEmpty}>{t('challenge.listEmpty')}</Text>
      )}

      <Text style={styles.sectionLabel}>{t('progress.history')}</Text>
    </View>
  );

  return (
    <FlatList
      style={styles.screen}
      data={filtered}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <SessionRow session={item} onDelete={confirmDelete} />}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{t('progress.empty')}</Text>
          <Text style={styles.emptyBody}>{t('progress.emptyBody')}</Text>
        </View>
      }
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
      showsVerticalScrollIndicator={false}
    />
  );
}

/**
 * The last seven days against the WHO guideline, and sets per muscle group
 * against the evidence-based ranges (src/utils/weekly.js).
 */
function WhoCard({ training }) {
  const t = useT();
  const maxSets = Math.max(10, ...MUSCLE_PARTS.map((p) => training.sets[p]));
  return (
    <View style={styles.whoCard}>
      <Text style={styles.whoTitle}>{t('who.title')}</Text>
      <View style={styles.whoRow}>
        <Text style={styles.whoLabel}>{t('who.strength')}</Text>
        <Text style={styles.whoValue}>{`${training.strengthDays}/2`}</Text>
      </View>
      <ProgressBar value={training.strengthDays} max={2} />
      <View style={styles.whoRow}>
        <Text style={styles.whoLabel}>{t('who.minutes')}</Text>
        <Text style={styles.whoValue}>{`${training.minutes}/150`}</Text>
      </View>
      <ProgressBar value={training.minutes} max={150} />
      <Text style={[styles.whoLabel, styles.whoSets]}>{t('who.sets')}</Text>
      {MUSCLE_PARTS.map((part) => (
        <View key={part} style={styles.setRow}>
          <Text style={styles.setPart}>{t(`part.${part}`)}</Text>
          <View style={styles.setBar}>
            <View
              style={[
                styles.setFill,
                { width: `${(training.sets[part] / maxSets) * 100}%` },
                training.sets[part] >= 4 && styles.setFillOk,
              ]}
            />
            {/* The least that works, and where growth starts. */}
            <View style={[styles.setMark, { left: `${(4 / maxSets) * 100}%` }]} />
            <View style={[styles.setMark, { left: `${(10 / maxSets) * 100}%` }]} />
          </View>
          <Text style={styles.setCount}>{training.sets[part]}</Text>
        </View>
      ))}
      <Text style={styles.whoNote}>{t('who.setsNote')}</Text>
      <Text style={styles.whoNote}>{t('who.note')}</Text>
    </View>
  );
}

/** Challenges shown under the badges; the list keeps more. */
const CHALLENGES_SHOWN = 5;

/** One challenge sent or received: who, what, the scores and how it went. */
function ChallengeRow({ record }) {
  const { t, speechTag } = useI18n();
  const exercise = getExercise(record.exerciseId);
  const unit = record.format === 'hold' ? t('common.secs') : t('common.reps');
  const what =
    record.format === 'hold'
      ? `${t(`exercise.${exercise.id}`)} · ${t('challenge.formatHold')}`
      : `${t(`exercise.${exercise.id}`)} · ${t('common.seconds', { n: record.durationSeconds })}`;
  const line =
    record.direction === 'received'
      ? t('challenge.rowReceived', {
          name: record.opponent || t('challenge.someone'),
          theirs: record.theirScore,
          mine: Number.isFinite(record.myScore) ? record.myScore : '—',
        })
      : t('challenge.rowSent', { mine: record.myScore });
  return (
    <View style={styles.challengeRow}>
      <View style={styles.challengeText}>
        <Text style={styles.challengeLine} numberOfLines={1}>
          {what} · {line} {unit}
        </Text>
        <Text style={styles.challengeDate}>
          {formatSessionDate(record.at, Date.now(), {
            today: t('session.today'),
            yesterday: t('session.yesterday'),
            locale: speechTag,
          })}
        </Text>
      </View>
      {record.result ? (
        <Text style={[styles.challengeResult, styles[`result_${record.result}`]]}>
          {t(`challenge.short.${record.result}`)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  whoCard: { backgroundColor: colors.surface, borderRadius: 24, padding: spacing.md, marginTop: spacing.md },
  whoTitle: { fontSize: 15, ...font('600'), color: colors.text, marginBottom: spacing.xs },
  whoRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm, marginBottom: 4 },
  whoLabel: { ...font('500'), fontSize: 13, color: colors.textDim },
  whoValue: { ...font('600'), fontSize: 13, color: colors.text, fontVariant: ['tabular-nums'] },
  whoSets: { marginTop: spacing.md, marginBottom: 4 },
  setRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  setPart: { ...font('400'), fontSize: 12, color: colors.textDim, width: 72 },
  setBar: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  setFill: { height: '100%', backgroundColor: colors.textFaint },
  setFillOk: { backgroundColor: colors.accent },
  setMark: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: colors.border },
  setCount: { ...font('600'), fontSize: 12, color: colors.text, width: 28, textAlign: 'right' },
  whoNote: { ...font('400'), fontSize: 11, color: colors.textFaint, marginTop: spacing.sm, lineHeight: 15 },
  sectionAction: { fontSize: 13, ...font('600'), color: colors.accent, marginTop: spacing.lg },
  challengeEmpty: { ...font('400'), fontSize: 13, color: colors.textFaint, lineHeight: 19 },
  challengeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  challengeText: { flex: 1 },
  challengeLine: { ...font('400'), fontSize: 14, color: colors.text },
  challengeDate: { ...font('400'), fontSize: 12, color: colors.textFaint, marginTop: 2 },
  challengeResult: { ...type.label, marginLeft: spacing.sm },
  result_win: { color: colors.accent },
  result_lose: { color: colors.danger },
  result_draw: { color: colors.warn },
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  title: { ...type.title, color: colors.text, marginBottom: spacing.md },
  filter: { marginBottom: spacing.md },
  statsRow: { flexDirection: 'row' },
  statsRowGap: { marginTop: spacing.sm },
  gap: { width: spacing.sm },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    ...type.heading,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionMeta: { ...font('500'), fontSize: 13, color: colors.textDim },
  empty: { alignItems: 'center', paddingVertical: spacing.xl },
  emptyTitle: { fontSize: 17, ...font('600'), color: colors.textDim },
  emptyBody: {
    ...type.body,
    color: colors.textFaint,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
