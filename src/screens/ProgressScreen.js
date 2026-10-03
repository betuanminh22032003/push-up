import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ACHIEVEMENTS, longestStreak } from '../achievements/achievements';
import { AchievementGrid } from '../components/AchievementGrid';
import { ExercisePicker } from '../components/ExercisePicker';
import { SessionRow } from '../components/SessionRow';
import { StatTile } from '../components/StatTile';
import { WeeklyChart } from '../components/WeeklyChart';
import { EXERCISES, exerciseOf, filterByExercise, isHold, isHoldSession } from '../exercises/exercises';
import { useT } from '../i18n/I18nContext';
import { useSessions } from '../state/SessionsContext';
import { useSettings } from '../state/SettingsContext';
import { colors, spacing, type } from '../theme/theme';
import { confirm } from '../utils/confirm';
import { computeStats, dailyTotals } from '../utils/stats';
import { formatDuration } from '../utils/time';

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
export function ProgressScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { sessions, stats, achievements, removeSession } = useSessions();
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
  const shownStats = useMemo(
    () => (all ? stats : computeStats(filtered, Date.now(), options)),
    [all, stats, filtered, options],
  );
  const unit = seconds ? t('common.secs') : undefined;
  const goal = all ? settings.dailyGoal : 0;

  const week = useMemo(() => dailyTotals(filtered, 7, Date.now(), options), [filtered, options]);
  const weekTotal = week.reduce((sum, d) => sum + d.reps, 0);
  const streakRecord = useMemo(() => longestStreak(filtered), [filtered]);

  const confirmDelete = (session) => {
    confirm({
      title: t('confirm.deleteTitle'),
      message: t('confirm.deleteBody', { reps: session.totalReps }),
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
            ...inHistory.map((e) => ({ id: e.id, icon: e.icon, label: t(`exercise.${e.id}`) })),
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

const styles = StyleSheet.create({
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
    ...type.label,
    color: colors.textFaint,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionMeta: { fontSize: 12, color: colors.textDim },
  empty: { alignItems: 'center', paddingVertical: spacing.xl },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: colors.textDim },
  emptyBody: {
    ...type.body,
    color: colors.textFaint,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
