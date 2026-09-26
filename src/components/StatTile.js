import { StyleSheet, Text, View } from 'react-native';

import { ProgressBar } from './ProgressBar';
import { colors, radius, spacing, type } from '../theme/theme';

/**
 * @param {object}  props
 * @param {{ value: number, max: number, caption?: string }} [props.progress]
 *        optional bar under the value, e.g. today's reps against the goal
 */
export function StatTile({ label, value, suffix, highlight, progress }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueRow}>
        <Text style={[styles.value, highlight && styles.valueHighlight]} numberOfLines={1}>
          {value}
        </Text>
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </View>
      {progress ? (
        <View style={styles.progress}>
          <ProgressBar value={progress.value} max={progress.max} height={4} />
          {progress.caption ? <Text style={styles.caption}>{progress.caption}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  label: { ...type.label, color: colors.textFaint, textTransform: 'uppercase' },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: spacing.xs },
  value: { ...type.stat, color: colors.text },
  valueHighlight: { color: colors.accent },
  suffix: { fontSize: 13, color: colors.textDim, marginLeft: 3 },
  progress: { width: '100%', marginTop: spacing.sm, alignItems: 'center' },
  caption: { fontSize: 10, color: colors.textFaint, marginTop: 4 },
});
