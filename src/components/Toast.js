import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '../theme/theme';

const SHOW_MS = 2600;

/**
 * A banner that drops in from the top for achievements and the daily goal.
 * Purely presentational: the parent owns the queue and hands over one
 * message at a time via `message`; `onHide` asks for the next.
 */
export function Toast({ message, onHide }) {
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(-80)).current;
  const onHideRef = useRef(onHide);
  useEffect(() => {
    onHideRef.current = onHide;
  }, [onHide]);

  useEffect(() => {
    if (!message) return undefined;
    y.setValue(-80);
    Animated.spring(y, { toValue: 0, useNativeDriver: true, friction: 7 }).start();
    const timer = setTimeout(() => {
      Animated.timing(y, { toValue: -80, duration: 200, useNativeDriver: true }).start(() => {
        onHideRef.current?.();
      });
    }, SHOW_MS);
    return () => clearTimeout(timer);
  }, [message, y]);

  if (!message) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.toast, { top: insets.top + spacing.sm, transform: [{ translateY: y }] }]}
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    zIndex: 10,
    elevation: 6,
  },
  text: { fontSize: 14, fontWeight: '600', color: colors.text, textAlign: 'center' },
});
