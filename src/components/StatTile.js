import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, type } from '../theme/theme';

export function StatTile({ label, value, suffix, highlight }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueRow}>
        <Text style={[styles.value, highlight && styles.valueHighlight]} numberOfLines={1}>
          {value}
        </Text>
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </View>
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
});
