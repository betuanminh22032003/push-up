import { StyleSheet, Text, View } from 'react-native';

import { useT } from '../i18n/I18nContext';
import { colors, font, radius, spacing } from '../theme/theme';

const CHART_HEIGHT = 120;

/**
 * Seven bars, one per day, oldest on the left. Pure Views — a bar chart is
 * a row of rectangles, and a charting library would be the largest
 * dependency in the app for it.
 *
 * The goal is drawn as a line so a bar reaching it reads as "done today".
 * @param {Array<{ key: string, reps: number, offset: number }>} days
 */
export function WeeklyChart({ days, goal }) {
  const t = useT();
  const peak = Math.max(goal || 0, ...days.map((d) => d.reps), 1);
  const goalY = goal > 0 ? (goal / peak) * CHART_HEIGHT : null;

  return (
    <View style={styles.wrap}>
      <View style={styles.plot}>
        {goalY !== null ? <View style={[styles.goalLine, { bottom: goalY }]} /> : null}
        {days.map((day) => {
          const height = Math.max(day.reps > 0 ? 4 : 2, (day.reps / peak) * CHART_HEIGHT);
          const reached = goal > 0 && day.reps >= goal;
          const [y, m, d] = day.key.split('-').map(Number);
          const weekday = new Date(y, m - 1, d, 12).getDay();
          return (
            <View key={day.key} style={styles.column}>
              <Text style={styles.value}>{day.reps > 0 ? day.reps : ''}</Text>
              <View style={styles.barSlot}>
                <View
                  style={[
                    styles.bar,
                    { height },
                    day.reps > 0 && styles.barFilled,
                    reached && styles.barReached,
                    day.offset === 0 && styles.barToday,
                  ]}
                />
              </View>
              <Text style={[styles.label, day.offset === 0 && styles.labelToday]}>
                {t(`weekday.${weekday}`)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  plot: { flexDirection: 'row', alignItems: 'flex-end' },
  goalLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    // Sits above the value labels' slot so it lines up with the bar slots.
    marginBottom: 18,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.textFaint,
  },
  column: { flex: 1, alignItems: 'center' },
  value: { ...font('400'), fontSize: 10, color: colors.textDim, height: 14, lineHeight: 14 },
  barSlot: { height: CHART_HEIGHT, justifyContent: 'flex-end', width: '100%', alignItems: 'center' },
  bar: { width: '58%', borderRadius: 8, backgroundColor: colors.surfaceAlt },
  barFilled: { backgroundColor: colors.accentDim },
  barReached: { backgroundColor: colors.accent },
  barToday: { borderWidth: 1, borderColor: colors.accent },
  label: { ...font('400'), fontSize: 11, color: colors.textFaint, marginTop: spacing.xs },
  labelToday: { color: colors.text, ...font('600') },
});
