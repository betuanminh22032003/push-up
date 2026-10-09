import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, font, radius, spacing } from '../theme/theme';

/**
 * @param {'primary'|'secondary'|'danger'} variant
 */
export function Button({ label, onPress, variant = 'primary', style, disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[styles.label, styles[`${variant}Label`]]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.surfaceAlt },
  danger: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.danger,
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.35 },
  label: { fontSize: 17, ...font('700'), letterSpacing: 0.1, textAlign: 'center' },
  primaryLabel: { color: colors.bg },
  secondaryLabel: { color: colors.text },
  dangerLabel: { color: colors.danger },
});
