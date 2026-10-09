import { Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { colors, font, radius, spacing, type } from '../theme/theme';

/** A labelled card of rows, as used by the settings and blocker screens. */
export function Section({ label, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

/** A labelled setting; `stacked` puts the control under the text instead of beside it. */
export function Row({ title, body, bodyWarn, stacked, children }) {
  return (
    <View style={[styles.row, stacked && styles.rowStacked]}>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        {body ? <Text style={[styles.rowBody, bodyWarn && styles.rowBodyWarn]}>{body}</Text> : null}
      </View>
      {children ? <View style={stacked ? styles.rowControlStacked : null}>{children}</View> : null}
    </View>
  );
}

export function LinkRow({ title, body, onPress, danger }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, danger && styles.danger]}>{title}</Text>
        {body ? <Text style={styles.rowBody}>{body}</Text> : null}
      </View>
      <Text style={[styles.chevron, danger && styles.danger]}>›</Text>
    </Pressable>
  );
}

export function Toggle({ value, onChange, label, disabled }) {
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      accessibilityLabel={label}
      trackColor={{ false: colors.border, true: colors.accentDim }}
      thumbColor={value ? colors.accent : colors.textDim}
      ios_backgroundColor={colors.border}
      // react-native-web colours the "on" switch with these instead.
      {...(Platform.OS === 'web' ? { activeThumbColor: colors.accent, activeTrackColor: colors.accentDim } : null)}
    />
  );
}

export function Chips({ options, selected, onSelect }) {
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = o.id === selected;
        return (
          <Pressable
            key={String(o.id)}
            onPress={() => onSelect(o.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={[styles.chip, on && styles.chipOn]}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.5 },
  section: { marginTop: spacing.lg },
  sectionLabel: { ...type.heading, color: colors.text, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  rowStacked: { flexDirection: 'column', alignItems: 'stretch' },
  rowText: { flex: 1 },
  rowControlStacked: { marginTop: spacing.sm },
  rowTitle: { fontSize: 15, ...font('500'), color: colors.text },
  rowBody: { ...font('400'), fontSize: 13, color: colors.textDim, marginTop: 2, lineHeight: 18 },
  rowBodyWarn: { color: colors.warn },
  chevron: { ...font('400'), fontSize: 22, color: colors.textFaint },
  danger: { color: colors.danger },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  chipOn: { backgroundColor: colors.accent },
  chipText: { ...font('500'), fontSize: 14, color: colors.textDim },
  chipTextOn: { color: colors.bg, ...font('700') },
});
