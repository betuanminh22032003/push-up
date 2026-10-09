import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getExercise } from '../exercises/exercises';
import { useI18n } from '../i18n/I18nContext';
import { colors, radius, spacing } from '../theme/theme';
import { formatDuration, formatSessionDate } from '../utils/time';

export function SessionRow({ session, onDelete }) {
  const { t, speechTag } = useI18n();
  const { totalReps, durationSeconds, timestamp, sets, program } = session;
  // Sessions from before there was a choice carry no exerciseId: push-ups.
  const exercise = getExercise(session.exerciseId);
  // A hold's total is seconds held, which has no pace.
  const hold = exercise.kind === 'hold';
  const pace = durationSeconds > 0 ? (totalReps / (durationSeconds / 60)).toFixed(1) : '0.0';

  const details = [formatDuration(durationSeconds)];
  if (!hold) details.push(`${pace} ${t('session.repsPerMin')}`);
  if (Array.isArray(sets) && sets.length > 1) details.push(t('session.sets', { n: sets.length }));

  // Schedule days carry their week; the old push-up program's did not.
  const tag = !program
    ? null
    : Number.isFinite(program.week)
      ? t('session.scheduleDay', { week: program.week, day: program.day })
      : t('session.programDay', { day: program.day });

  return (
    <View style={styles.row}>
      <View style={styles.repsBadge}>
        <Text style={styles.repsValue}>{totalReps}</Text>
        <Text style={styles.repsLabel}>{hold ? t('common.secs') : t('common.reps')}</Text>
      </View>

      <View style={styles.meta}>
        <View style={styles.dateRow}>
          <Text style={styles.date}>
            {formatSessionDate(timestamp, Date.now(), {
              today: t('session.today'),
              yesterday: t('session.yesterday'),
              locale: speechTag,
            })}
          </Text>
          {tag ? <Text style={styles.tag}>{tag}</Text> : null}
        </View>
        <Text style={styles.exercise} numberOfLines={1}>
          {`${exercise.icon} ${t(`exercise.${exercise.id}`)}`}
        </Text>
        <Text style={styles.sub}>{details.join(' · ')}</Text>
      </View>

      <Pressable
        onPress={() => onDelete(session)}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={t(hold ? 'session.deleteHold' : 'session.delete', { reps: totalReps })}
        style={({ pressed }) => [styles.delete, pressed && { opacity: 0.5 }]}
      >
        <Text style={styles.deleteGlyph}>×</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  repsBadge: {
    width: 62,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingRight: spacing.sm,
  },
  repsValue: { fontSize: 24, fontWeight: '600', color: colors.accent },
  repsLabel: { fontSize: 10, color: colors.textFaint, letterSpacing: 1 },
  meta: { flex: 1, paddingLeft: spacing.md },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  date: { fontSize: 15, fontWeight: '500', color: colors.text },
  tag: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.accent,
    borderWidth: 1,
    borderColor: colors.accentDim,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  exercise: { fontSize: 13, color: colors.text, marginTop: 2 },
  sub: { fontSize: 13, color: colors.textDim, marginTop: 2 },
  delete: { paddingHorizontal: spacing.sm },
  deleteGlyph: { fontSize: 26, color: colors.textFaint, lineHeight: 28 },
});
