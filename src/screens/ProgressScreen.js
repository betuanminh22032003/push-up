import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ACHIEVEMENTS, longestStreak } from '../achievements/achievements';
import { AchievementGrid } from '../components/AchievementGrid';
import { SessionRow } from '../components/SessionRow';
import { StatTile } from '../components/StatTile';
import { WeeklyChart } from '../components/WeeklyChart';
import { useT } from '../i18n/I18nContext';
import { useSessions } from '../state/SessionsContext';
import { useSettings } from '../state/SettingsContext';
import { colors, spacing, type } from '../theme/theme';
import { confirm } from '../utils/confirm';
import { dailyTotals } from '../utils/stats';
import { formatDuration } from '../utils/time';

/** Chart, records, badges, and every workout — the "why keep going" tab. */
export function ProgressScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { sessions, stats, achievements, removeSession } = useSessions();
  const { settings } = useSettings();

  const week = useMemo(() => dailyTotals(sessions, 7), [sessions]);
  const weekTotal = week.reduce((sum, d) => sum + d.reps, 0);
  const streakRecord = useMemo(() => longestStreak(sessions), [sessions]);

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

      <View style={styles.sectionRow}>
        <Text style={styles.sectionLabel}>{t('progress.lastDays')}</Text>
        <Text style={styles.sectionMeta}>{t('progress.weekTotal', { reps: weekTotal })}</Text>
      </View>
      <WeeklyChart days={week} goal={settings.dailyGoal} />

      <Text style={styles.sectionLabel}>{t('progress.records')}</Text>
      <View style={styles.statsRow}>
        <StatTile label={t('progress.bestSet')} value={stats.bestSet} />
        <View style={styles.gap} />
        <StatTile label={t('progress.bestDay')} value={stats.bestDay} />
        <View style={styles.gap} />
        <StatTile
          label={t('progress.longestStreak')}
          value={streakRecord}
          suffix={streakRecord === 1 ? t('common.day') : t('common.days')}
        />
      </View>
      <View style={[styles.statsRow, styles.statsRowGap]}>
        <StatTile label={t('progress.workouts')} value={stats.sessionCount} />
        <View style={styles.gap} />
        <StatTile label={t('progress.totalTime')} value={formatDuration(stats.totalSeconds)} />
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
      data={sessions}
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
