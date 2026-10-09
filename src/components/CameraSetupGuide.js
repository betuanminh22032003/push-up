import { StyleSheet, Text, View } from 'react-native';

import { cameraSetupFor } from '../exercises/cameraSetup';
import { getExercise } from '../exercises/exercises';
import { useT } from '../i18n/I18nContext';
import { colors, font, radius, spacing, type } from '../theme/theme';
import { Button } from './Button';

/**
 * The card shown before the camera counts: where the phone goes for this
 * exercise, drawn and said in three lines, plus the exercise's own hint.
 *
 * The drawing is plain views (no image assets, no SVG dependency): a floor,
 * a stick figure lying, sitting or standing, the phone on its stand at the
 * right height, and the distance between them.
 *
 * @param {string}   exerciseId
 * @param {Function} onStart      primary button
 * @param {string}   startLabel   its label (defaults to "Open camera")
 * @param {Function} onCancel     optional secondary button
 */
export function CameraSetupGuide({ exerciseId, onStart, startLabel, onCancel, cancelLabel }) {
  const t = useT();
  const setup = cameraSetupFor(exerciseId);
  const exercise = getExercise(exerciseId);
  const lines = [
    t(`setup.view.${setup.view}`),
    t('setup.distance', { m: setup.distance }),
    t(`setup.height.${setup.height}`),
  ];

  return (
    <View style={styles.card}>
      <Text style={styles.title}>
        {exercise.icon} {t('setup.title', { exercise: t(`exercise.${exercise.id}`) })}
      </Text>
      <SetupDrawing setup={setup} label={lines.join(', ')} />
      {lines.map((line, i) => (
        <Text key={i} style={styles.line}>
          {['📱', '↔️', '↕️'][i]}  {line}
        </Text>
      ))}
      <Text style={styles.hint}>{t(`exercise.${exercise.id}.hint.ai`)}</Text>
      <Text style={styles.gate}>{t('setup.gate')}</Text>
      <View style={styles.buttons}>
        {onCancel ? (
          <>
            <Button label={cancelLabel || t('common.cancel')} variant="secondary" onPress={onCancel} style={styles.grow} />
            <View style={styles.gap} />
          </>
        ) : null}
        <Button label={startLabel || t('setup.start')} onPress={onStart} style={styles.grow} />
      </View>
    </View>
  );
}

const W = 280;
const H = 120;
const GROUND = 12;
const PHONE_LIFT = { floor: 0, knee: 30, waist: 52 };

/** The figure, the phone and the distance, side by side above a floor line. */
function SetupDrawing({ setup, label }) {
  const lift = PHONE_LIFT[setup.height];
  const phoneBottom = GROUND + lift;
  // Where the figure ends on the right, for the distance line to start.
  const figureRight = setup.posture === 'floor' ? 150 : 110;
  const lineY = phoneBottom + 12;

  return (
    <View style={styles.drawing} accessible accessibilityRole="image" accessibilityLabel={label}>
      <View style={styles.ground} />
      <Figure posture={setup.posture} view={setup.view} />

      {/* the phone, on its stand unless it lies on the floor, lens to the left */}
      {lift > 0 ? <View style={[styles.stand, { height: lift }]} /> : null}
      <View style={[styles.phone, { bottom: phoneBottom }]}>
        <View style={styles.lens} />
      </View>

      <View style={[styles.dash, { left: figureRight + 6, bottom: lineY, width: 228 - figureRight - 10 }]} />
      <Text style={[styles.distance, { left: figureRight + 6, bottom: lineY + 4, width: 228 - figureRight - 10 }]}>
        ≈ {setup.distance} m
      </Text>
    </View>
  );
}

/** A stick figure: lying along the floor, sitting, or standing (arms out when it faces the camera). */
function Figure({ posture, view }) {
  if (posture === 'floor') {
    return (
      <>
        <View style={[styles.head, { left: 14, bottom: GROUND + 10 }]} />
        <View style={[styles.limb, { left: 34, bottom: GROUND + 16, width: 116, height: 10 }]} />
        <View style={[styles.limb, { left: 40, bottom: GROUND, width: 8, height: 20 }]} />
      </>
    );
  }
  if (posture === 'seat') {
    return (
      <>
        <View style={[styles.head, { left: 52, bottom: GROUND + 58 }]} />
        <View style={[styles.limb, { left: 58, bottom: GROUND + 12, width: 10, height: 46 }]} />
        <View style={[styles.limb, { left: 58, bottom: GROUND + 8, width: 50, height: 10 }]} />
      </>
    );
  }
  return (
    <>
      <View style={[styles.head, { left: 68, bottom: GROUND + 76 }]} />
      <View style={[styles.limb, { left: 74, bottom: GROUND + 34, width: 10, height: 42 }]} />
      <View style={[styles.limb, { left: 70, bottom: GROUND, width: 8, height: 36 }]} />
      <View style={[styles.limb, { left: 80, bottom: GROUND, width: 8, height: 36 }]} />
      {view === 'front' ? (
        <View style={[styles.limb, { left: 50, bottom: GROUND + 64, width: 58, height: 8 }]} />
      ) : (
        <View style={[styles.limb, { left: 76, bottom: GROUND + 40, width: 8, height: 34 }]} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  title: { ...type.title, fontSize: 18, color: colors.text },
  drawing: {
    width: W,
    height: H,
    alignSelf: 'center',
    marginVertical: spacing.md,
  },
  ground: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: GROUND - 2,
    height: 2,
    backgroundColor: colors.border,
  },
  head: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accent,
  },
  limb: { position: 'absolute', borderRadius: 5, backgroundColor: colors.accent },
  stand: { position: 'absolute', left: 240, bottom: GROUND, width: 3, backgroundColor: colors.textFaint },
  phone: {
    position: 'absolute',
    left: 233,
    width: 16,
    height: 26,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.text,
    backgroundColor: colors.surfaceAlt,
  },
  lens: {
    position: 'absolute',
    left: 1,
    top: 3,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.warn,
  },
  dash: {
    position: 'absolute',
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.textDim,
  },
  distance: { position: 'absolute', textAlign: 'center', fontSize: 13, ...font('600'), color: colors.text },
  line: { ...type.body, color: colors.text, marginTop: spacing.xs },
  hint: { ...font('400'), fontSize: 13, color: colors.textDim, marginTop: spacing.md, lineHeight: 19 },
  gate: { ...font('400'), fontSize: 13, color: colors.accent, marginTop: spacing.sm, lineHeight: 19 },
  buttons: { flexDirection: 'row', marginTop: spacing.lg },
  grow: { flex: 1 },
  gap: { width: spacing.sm },
});
