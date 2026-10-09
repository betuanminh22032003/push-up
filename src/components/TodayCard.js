import { StyleSheet, Text, View } from 'react-native';

import { ProgressBar } from './ProgressBar';
import { useT } from '../i18n/I18nContext';
import { colors, font, radius, spacing, type } from '../theme/theme';
import { Icon } from './Icon';

/**
 * The home screen's one card about the day: reps against the goal with its
 * bar, the streak as a flame, and the all-time total underneath.
 */
export function TodayCard({ today, goal, streak, total, style }) {
  const t = useT();
  const done = goal > 0 && today >= goal;
  const days = streak === 1 ? t('common.day') : t('common.days');
  return (
    <View
      style={[styles.card, style]}
      accessible
      accessibilityLabel={`${t('stat.today')}: ${today} / ${goal}. ${t('stat.streak')}: ${streak} ${days}. ${t('stat.total')}: ${total}`}
    >
      <View style={styles.top}>
        <View style={styles.grow}>
          <Text style={styles.label}>{t('stat.today')}</Text>
          <View style={styles.valueRow}>
            <Text style={styles.value} numberOfLines={1}>
              {today}
            </Text>
            <Text style={styles.goal}>{` / ${goal} ${t('common.reps')}`}</Text>
          </View>
        </View>
        <View style={styles.side}>
          <View style={[styles.flame, streak > 0 && styles.flameOn]}>
            <Icon name="flame" size={15} color={streak > 0 ? colors.flame : colors.textFaint} />
            <Text style={[styles.flameText, streak > 0 && styles.flameTextOn]}>{`${streak} ${days}`}</Text>
          </View>
          <Text style={styles.total}>{`${t('stat.total')} ${total}`}</Text>
        </View>
      </View>
      <ProgressBar value={today} max={goal} height={8} style={styles.bar} />
      <Text style={[styles.caption, done && styles.captionDone]}>
        {done ? t('stat.goalDone') : t('stat.toGo', { n: Math.max(0, goal - today) })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md + 2,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start' },
  grow: { flex: 1 },
  label: { ...type.label, color: colors.textDim },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 2 },
  value: { fontSize: 40, ...font('800'), color: colors.text, letterSpacing: -1 },
  goal: { ...font('500'), fontSize: 15, color: colors.textDim },
  side: { alignItems: 'flex-end', gap: spacing.sm },
  flame: {
    paddingVertical: 5,
    paddingHorizontal: spacing.sm + 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  flameOn: { backgroundColor: colors.flameSoft },
  flameText: { ...font('700'), fontSize: 14, color: colors.textDim },
  flameTextOn: { color: colors.flame },
  total: { ...font('500'), fontSize: 13, color: colors.textFaint },
  bar: { marginTop: spacing.md },
  caption: { ...font('500'), fontSize: 13, color: colors.textDim, marginTop: spacing.sm },
  captionDone: { color: colors.flame },
});
