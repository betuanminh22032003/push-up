import { StyleSheet, View } from 'react-native';

import { colors, radius } from '../theme/theme';

/** A thin fill bar. `value` / `max`, clamped; turns fully green when complete. */
export function ProgressBar({ value, max, height = 6, style }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const complete = max > 0 && value >= max;
  return (
    <View
      style={[styles.track, { height, borderRadius: height / 2 }, style]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max, now: Math.min(value, max) }}
    >
      <View
        style={[
          styles.fill,
          { width: `${pct * 100}%`, borderRadius: height / 2 },
          complete && styles.fillComplete,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', backgroundColor: colors.surfaceAlt, overflow: 'hidden', borderRadius: radius.pill },
  fill: { height: '100%', backgroundColor: colors.accent },
  // Goal reached: the warm colour, so the bar itself says "done".
  fillComplete: { backgroundColor: colors.flame },
});
