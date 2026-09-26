import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '../theme/theme';

/**
 * Bottom tabs. Plain Pressables rather than a navigation library: four
 * screens, no stacks, and the bar has to disappear during a workout, which
 * is a one-line condition here and a plugin elsewhere.
 */
export function TabBar({ tabs, activeId, onSelect }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onSelect(tab.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
            style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
          >
            <Text style={[styles.icon, active && styles.iconActive]}>{tab.icon}</Text>
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
    paddingTop: spacing.sm,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: spacing.xs },
  pressed: { opacity: 0.6 },
  icon: { fontSize: 20, color: colors.textFaint },
  iconActive: { color: colors.accent },
  label: { fontSize: 11, fontWeight: '600', color: colors.textFaint, marginTop: 2 },
  labelActive: { color: colors.text },
});
