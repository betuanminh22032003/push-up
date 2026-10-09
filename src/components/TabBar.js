import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, font, radius, spacing } from '../theme/theme';

/**
 * Bottom tabs. Plain Pressables rather than a navigation library: five
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
            <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
              <Text style={[styles.icon, active && styles.iconActive]}>{tab.icon}</Text>
            </View>
            <Text
              style={[styles.label, active && styles.labelActive]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
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
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.sm,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  pressed: { opacity: 0.6 },
  // The selected tab's icon sits on a soft pill of the brand colour.
  iconWrap: {
    width: 56,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: { backgroundColor: colors.accentSoft },
  icon: { ...font('400'), fontSize: 19, opacity: 0.5 },
  iconActive: { opacity: 1 },
  label: { fontSize: 11, ...font('500'), color: colors.textFaint, marginTop: 3 },
  labelActive: { color: colors.text, ...font('700') },
});
