import { useCallback, useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { colors, font, radius, spacing } from '../theme/theme';

/**
 * One row of exercise chips (icon + name), exactly one selected, read out as
 * radio buttons. Used to choose the workout's exercise, and as the history
 * filter on the progress tab with an "All" chip in front.
 *
 * The row scrolls sideways rather than wrapping: four English names do not
 * fit a 360dp phone, and a second row of chips would take its height from
 * the camera stage. Content that fits is centred (or left-aligned) as usual.
 * The selected chip is scrolled into view, so a choice that sits off to the
 * right (jumping jacks, on a narrow phone) is not hidden on the next launch.
 *
 * @param {Array<{ id: string, icon?: string, label: string }>} options
 * @param {string}   selected  id of the chosen option
 * @param {Function} onSelect  called with the id of the pressed option
 * @param {string}   label     what the group chooses, for screen readers
 * @param {'center'|'start'} [align]
 * @param {number}   [bleed]   the parent's horizontal padding: the row scrolls
 *                             under it to the screen edge instead of being
 *                             clipped short of it
 */
export function ExercisePicker({ options, selected, onSelect, label, align = 'center', bleed = 0, style }) {
  const scrollRef = useRef(null);
  // Plain refs: layout and scroll position are only read to decide a scroll.
  const viewRef = useRef({ width: 0, x: 0 });
  const boxesRef = useRef({});

  const reveal = useCallback(
    (animated) => {
      const box = boxesRef.current[selected];
      const { width, x } = viewRef.current;
      if (!box || !width) return;
      const left = box.x - bleed;
      const right = box.x + box.width + bleed - width;
      if (left < x) scrollRef.current?.scrollTo({ x: Math.max(0, left), animated });
      else if (right > x) scrollRef.current?.scrollTo({ x: right, animated });
    },
    [selected, bleed],
  );

  useEffect(() => {
    reveal(true);
  }, [reveal]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={32}
      onScroll={(e) => {
        viewRef.current.x = e.nativeEvent.contentOffset.x;
      }}
      onLayout={(e) => {
        viewRef.current.width = e.nativeEvent.layout.width;
        reveal(false);
      }}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[styles.scroll, bleed ? { marginHorizontal: -bleed } : null, style]}
      contentContainerStyle={[
        styles.row,
        align === 'start' && styles.rowStart,
        bleed ? { paddingHorizontal: bleed } : null,
      ]}
    >
      {options.map((o) => {
        const on = o.id === selected;
        return (
          <Pressable
            key={o.id}
            onPress={() => onSelect(o.id)}
            onLayout={(e) => {
              boxesRef.current[o.id] = e.nativeEvent.layout;
              if (on) reveal(false);
            }}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: on, checked: on }}
            // react-native-web ignores accessibilityState; it reads the aria form.
            aria-checked={on}
            style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && !on && styles.pressed]}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
              {o.icon ? `${o.icon} ${o.label}` : o.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // A ScrollView grows by default; this one must not take height from the stage.
  scroll: { flexGrow: 0, flexShrink: 0 },
  row: { flexGrow: 1, justifyContent: 'center', gap: spacing.sm },
  rowStart: { justifyContent: 'flex-start' },
  pressed: { opacity: 0.6 },
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
