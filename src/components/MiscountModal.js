import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { createSessionId } from '../storage/sessions';
import { saveMiscount } from '../storage/records';
import { appInfo, deviceInfo } from '../diagnostics/device';
import { loadErrors } from '../diagnostics/errorLog';
import { buildMiscount, formatReport, NOTE_MAX } from '../diagnostics/report';
import { getExercise } from '../exercises/exercises';
import { useI18n } from '../i18n/I18nContext';
import { colors, radius, spacing, type } from '../theme/theme';
import { shareText } from '../utils/share';
import { Button } from './Button';

/**
 * "Miscounted?" after a camera set: the real count and an optional note,
 * kept on the phone. Then, only if the user taps it, a report for the
 * developer through the share sheet, showing exactly what it contains.
 *
 * @param {object|null} session  { exerciseId, sourceId, totalReps, durationSeconds, timestamp }
 */
export function MiscountModal({ session, onClose }) {
  const { t, language } = useI18n();
  const [realText, setRealText] = useState('');
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(null);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    // A new session gets a blank form.
    setRealText('');
    setNote('');
    setSaved(null);
    setInvalid(false);
  }, [session]);

  if (!session) return null;
  const exercise = getExercise(session.exerciseId);

  const save = async () => {
    const report = buildMiscount({ id: createSessionId(), session, view: exercise.view, realText, note });
    if (!report) {
      setInvalid(true);
      return;
    }
    await saveMiscount(report);
    setSaved(report);
  };

  const share = async () => {
    const errors = await loadErrors();
    shareText(
      formatReport({
        intro: t('miscount.reportIntro'),
        app: appInfo(),
        device: deviceInfo(),
        miscount: saved,
        errors,
        language,
      }),
    );
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{t('miscount.title')}</Text>
          {saved ? (
            <>
              <Text style={styles.body}>
                {t('miscount.saved', { counted: saved.counted, real: saved.real })}
              </Text>
              <Text style={styles.small}>{t('miscount.shareBody')}</Text>
              <Button label={t('miscount.share')} onPress={share} style={styles.button} />
              <Button label={t('common.close')} variant="secondary" onPress={onClose} style={styles.buttonSmall} />
            </>
          ) : (
            <>
              <Text style={styles.body}>
                {t('miscount.body', {
                  counted: session.totalReps,
                  exercise: `${exercise.icon} ${t(`exercise.${exercise.id}`)}`,
                })}
              </Text>
              <Text style={styles.label}>{t('miscount.real')}</Text>
              <TextInput
                value={realText}
                onChangeText={(text) => {
                  setRealText(text.replace(/[^0-9]/g, '').slice(0, 4));
                  setInvalid(false);
                }}
                keyboardType="number-pad"
                inputMode="numeric"
                placeholder={String(session.totalReps)}
                placeholderTextColor={colors.textFaint}
                style={[styles.input, invalid && styles.inputInvalid]}
                accessibilityLabel={t('miscount.real')}
                autoFocus
              />
              <Text style={styles.label}>{t('miscount.note')}</Text>
              <TextInput
                value={note}
                onChangeText={(text) => setNote(text.slice(0, NOTE_MAX))}
                placeholder={t('miscount.notePlaceholder')}
                placeholderTextColor={colors.textFaint}
                style={[styles.input, styles.note]}
                multiline
                accessibilityLabel={t('miscount.note')}
              />
              <Text style={styles.small}>{t('miscount.privacy')}</Text>
              <View style={styles.row}>
                <Button label={t('common.cancel')} variant="secondary" onPress={onClose} style={styles.grow} />
                <View style={styles.gap} />
                <Button label={t('miscount.save')} onPress={save} disabled={!realText} style={styles.grow} />
              </View>
            </>
          )}
          <Pressable onPress={onClose} hitSlop={12} style={styles.close} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: spacing.lg },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  title: { ...type.title, fontSize: 19, color: colors.text, paddingRight: spacing.lg },
  body: { ...type.body, color: colors.textDim, marginTop: spacing.sm, lineHeight: 21 },
  label: { ...type.label, color: colors.textFaint, marginTop: spacing.md },
  input: {
    marginTop: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    fontSize: 17,
  },
  inputInvalid: { borderColor: colors.danger },
  note: { minHeight: 64, fontSize: 15, textAlignVertical: 'top' },
  small: { fontSize: 12, color: colors.textFaint, marginTop: spacing.md, lineHeight: 17 },
  row: { flexDirection: 'row', marginTop: spacing.lg },
  grow: { flex: 1 },
  gap: { width: spacing.sm },
  button: { marginTop: spacing.lg },
  buttonSmall: { marginTop: spacing.sm },
  close: { position: 'absolute', top: spacing.md, right: spacing.md },
  closeText: { fontSize: 18, color: colors.textDim },
});
