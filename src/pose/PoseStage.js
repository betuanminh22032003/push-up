import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, type } from '../theme/theme';

/**
 * Native placeholder for camera pose detection.
 *
 * Live ML on camera frames needs per-frame pixel access, and expo-camera
 * exposes none — CameraView offers photo capture, recording and barcode
 * scanning, but no frame processor. Nor can Expo Go load a native module that
 * would provide one, so this cannot work without a development build.
 *
 * Wiring the real thing (see README, "Native pose detection"):
 *
 *   npx expo install expo-dev-client react-native-vision-camera \
 *     react-native-fast-tflite vision-camera-resize-plugin
 *   npx expo prebuild && npx expo run:android
 *
 * Then replace this file with a VisionCamera frame processor that resizes each
 * frame to the model's input, runs MoveNet through fast-tflite, and feeds the
 * keypoints through fromMoveNet() into the same analyser the web path uses.
 * The analyser, counter, session storage and stats need no changes at all —
 * that is the whole point of the normalised landmark schema.
 */
export function PoseStage() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Camera detection needs a dev build</Text>
      <Text style={styles.body}>
        Expo Go cannot run pose detection: expo-camera gives no access to live
        frames. Use the Proximity or Tap mode here, or run the web build to try
        the camera counter.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 20,
  },
  title: { ...type.title, fontSize: 17, color: colors.textDim, textAlign: 'center' },
  body: {
    ...type.body,
    color: colors.textFaint,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 21,
  },
});
