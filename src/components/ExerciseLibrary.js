import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BODY_PARTS, exercisesFor, getExercise } from '../exercises/exercises';
import { useT } from '../i18n/I18nContext';
import { colors, radius, spacing, type } from '../theme/theme';
import { ExerciseGuideButton } from './ExerciseGuide';
import { ExercisePicker } from './ExercisePicker';

/**
 * The exercise picker: the chosen exercise as one button, which opens the
 * whole library in a sheet, filtered by body part.
 *
 * A row of chips held four exercises; it cannot hold forty. The sheet lists
 * each exercise with what it trains, where the phone goes, whether it counts
 * reps or times a hold, and its form cues, so choosing one is also learning
 * how to do it.
 *
 * @param {string}   selected  id of the chosen exercise
 * @param {Function} onSelect  called with the id picked in the sheet
 * @param {boolean}  [disabled]
 *
 * Beside it, a button opens how to do the chosen exercise; each row of the
 * sheet has its own.
 */
export function ExerciseLibraryButton({ selected, onSelect, disabled, style }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const exercise = getExercise(selected);

  return (
    <View style={[styles.buttonRow, style]}>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${t(`exercise.${exercise.id}`)}. ${t('picker.change')}`}
        style={({ pressed }) => [styles.button, styles.grow, pressed && styles.pressed]}
      >
        <Text style={styles.buttonIcon}>{exercise.icon}</Text>
        <View style={styles.grow}>
          <Text style={styles.buttonName} numberOfLines={1}>
            {t(`exercise.${exercise.id}`)}
          </Text>
          <Text style={styles.buttonMeta} numberOfLines={1}>
            {exercise.parts.map((p) => t(`part.${p}`)).join(' · ')}
          </Text>
        </View>
        <Text style={styles.buttonChange}>{t('picker.change')} ▾</Text>
      </Pressable>
      <ExerciseGuideButton exerciseId={exercise.id} />
      <ExerciseLibrarySheet
        visible={open}
        selected={selected}
        onSelect={(id) => {
          setOpen(false);
          onSelect(id);
        }}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}

/** The sheet itself: body-part chips over the list. */
export function ExerciseLibrarySheet({ visible, selected, onSelect, onClose }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [part, setPart] = useState('all');
  const list = useMemo(() => exercisesFor(part), [part]);
  const chips = useMemo(
    () => [
      { id: 'all', label: t('part.all') },
      ...BODY_PARTS.map((p) => ({ id: p, label: t(`part.${p}`) })),
    ],
    [t],
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.dismiss} onPress={onClose} accessibilityLabel={t('common.close')} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.header}>
            <View style={styles.grow}>
              <Text style={styles.title}>{t('picker.title')}</Text>
              <Text style={styles.count}>{t('picker.count', { n: list.length })}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <Text style={styles.close}>×</Text>
            </Pressable>
          </View>

          <ExercisePicker
            options={chips}
            selected={part}
            onSelect={setPart}
            label={t('picker.title')}
            align="start"
            bleed={spacing.lg}
            style={styles.chips}
          />

          <FlatList
            data={list}
            keyExtractor={(e) => e.id}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const on = item.id === selected;
              return (
                <Pressable
                  onPress={() => onSelect(item.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, checked: on }}
                  aria-checked={on}
                  style={({ pressed }) => [styles.row, on && styles.rowOn, pressed && styles.pressed]}
                >
                  <Text style={styles.rowIcon}>{item.icon}</Text>
                  <View style={styles.grow}>
                    <View style={styles.rowTitleLine}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {t(`exercise.${item.id}`)}
                      </Text>
                      {item.kind === 'hold' ? <Text style={styles.badge}>{t('picker.hold')}</Text> : null}
                    </View>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {[...item.parts.map((p) => t(`part.${p}`)), t(`view.${item.view}`)].join(' · ')}
                    </Text>
                    <Text style={styles.rowCue} numberOfLines={2}>
                      {t(`exercise.${item.id}.cue`)}
                    </Text>
                  </View>
                  <ExerciseGuideButton exerciseId={item.id} compact />
                </Pressable>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  pressed: { opacity: 0.7 },

  buttonRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  buttonIcon: { fontSize: 24 },
  buttonName: { fontSize: 16, fontWeight: '600', color: colors.text },
  buttonMeta: { fontSize: 12, color: colors.textDim, marginTop: 1 },
  buttonChange: { fontSize: 13, fontWeight: '600', color: colors.accent },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  dismiss: { flex: 1 },
  sheet: {
    maxHeight: '88%',
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  title: { ...type.title, color: colors.text },
  count: { fontSize: 12, color: colors.textDim, marginTop: 2 },
  close: { fontSize: 30, lineHeight: 32, color: colors.textDim, paddingHorizontal: spacing.sm },
  chips: { marginBottom: spacing.sm },
  list: { flexGrow: 0 },
  listContent: { paddingBottom: spacing.md },

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowOn: { borderColor: colors.accent, backgroundColor: colors.surfaceAlt },
  rowIcon: { fontSize: 26, width: 34, textAlign: 'center' },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowName: { fontSize: 15, fontWeight: '600', color: colors.text, flexShrink: 1 },
  badge: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.warn,
    borderWidth: 1,
    borderColor: colors.warn,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  rowMeta: { fontSize: 12, color: colors.accent, marginTop: 2 },
  rowCue: { fontSize: 13, color: colors.textDim, marginTop: 4, lineHeight: 18 },
});
