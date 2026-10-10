import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ExerciseGlyph } from './ExerciseGlyph';
import { ExerciseGuideSheet } from './ExerciseGuide';
import { useT } from '../i18n/I18nContext';
import { colors, font, radius, spacing } from '../theme/theme';

/**
 * A schedule day at a glance: one tile per exercise with its figure, sets ×
 * target and name, in order. A tile opens that exercise's guide.
 */
export function PlanStrip({ items, style }) {
  const t = useT();
  const [open, setOpen] = useState(null);
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={style} contentContainerStyle={styles.row}>
        {items.map((item, i) => (
          <Pressable
            key={`${item.exerciseId}-${i}`}
            onPress={() => setOpen(item.exerciseId)}
            accessibilityRole="button"
            accessibilityLabel={t('guide.open', { name: t(`exercise.${item.exerciseId}`) })}
            style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
          >
            <ExerciseGlyph exerciseId={item.exerciseId} size={36} />
            <Text style={styles.target}>
              {item.max
                ? t('program.maxShort')
                : `${item.sets}×${item.target}${item.hold ? t('common.secShort') : ''}`}
            </Text>
            <Text style={styles.name} numberOfLines={1}>
              {t(`exercise.${item.exerciseId}`)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <ExerciseGuideSheet visible={!!open} exerciseId={open ?? items[0]?.exerciseId} onClose={() => setOpen(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingHorizontal: 2 },
  tile: {
    width: 78,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.7 },
  target: { ...font('700'), fontSize: 14, color: colors.text, marginTop: 6 },
  name: { ...font('400'), fontSize: 11, color: colors.textDim, marginTop: 1, paddingHorizontal: 4 },
});
