import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme/theme';
import { formatDuration, formatSessionDate } from '../utils/time';

export function SessionRow({ session, onDelete }) {
  const { totalReps, durationSeconds, timestamp } = session;
  const pace = durationSeconds > 0 ? (totalReps / (durationSeconds / 60)).toFixed(1) : '0.0';

  return (
    <View style={styles.row}>
      <View style={styles.repsBadge}>
        <Text style={styles.repsValue}>{totalReps}</Text>
        <Text style={styles.repsLabel}>reps</Text>
      </View>

      <View style={styles.meta}>
        <Text style={styles.date}>{formatSessionDate(timestamp)}</Text>
        <Text style={styles.sub}>
          {formatDuration(durationSeconds)} · {pace} reps/min
        </Text>
      </View>

      <Pressable
        onPress={() => onDelete(session)}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={`Delete session of ${totalReps} reps`}
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
  date: { fontSize: 15, fontWeight: '500', color: colors.text },
  sub: { fontSize: 13, color: colors.textDim, marginTop: 2 },
  delete: { paddingHorizontal: spacing.sm },
  deleteGlyph: { fontSize: 26, color: colors.textFaint, lineHeight: 28 },
});
