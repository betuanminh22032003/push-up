import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import { WebView } from 'react-native-webview';

import { POSE_PAGE_URL } from '../config';
import { useT } from '../i18n/I18nContext';
import { colors, radius, spacing, type } from '../theme/theme';

/**
 * Camera pose detection on native, via a WebView running MediaPipe.
 *
 * Why a WebView rather than a native model: expo-camera exposes no frame
 * processor — CameraView does photo capture, recording and barcode scanning,
 * but gives no access to live pixels — and Expo Go cannot load a native module
 * that would. A WebView is the one route to live ML that works in Expo Go, so
 * the feature is usable without a development build.
 *
 * The page it loads is generated from src/pose/ by `npm run build:pose`, so
 * the counting rules here are literally the same code the Node suite asserts
 * against — not a reimplementation that can drift.
 *
 * expo-camera is still used, for its permission API: Android only grants the
 * WebView camera access if the host app already holds CAMERA at the OS level.
 *
 * Which exercise to count travels in the URL (?exercise=<id>), and the page's
 * ready message says which one it actually counts. The published page lags the
 * code — GitHub Pages only updates when master is pushed — and a page from
 * before there were other exercises ignores the parameter and counts push-ups.
 * So a page that answers with a different exercise is refused, with an
 * explanation, rather than silently counting push-ups during a set of squats.
 * A ready message with no exercise at all comes from that older page, which
 * counts push-ups correctly, so for push-ups it is accepted.
 *
 * Pages from protocol 3 on run the visibility gate (./visibility): no reps
 * until the joints the exercise needs have been in view for a second, and
 * `visibility` messages saying which body part is missing, passed on through
 * `onVisibility`. An older page has no gate; it is reported as open the
 * moment it is ready, so counting works as it always did.
 *
 * `resetKey`: changing it restarts the analyser's count (a challenge starts
 * from zero when its clock does). `regateKey`: changing it closes the gate
 * again, so the whole body has to be seen once more.
 */
export function PoseStage({
  active,
  paused,
  onRep,
  onFrame,
  onVisibility,
  resetKey,
  regateKey,
  exercise = 'pushup',
}) {
  const t = useT();
  const webviewRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [cameraUp, setCameraUp] = useState(false);
  const [failure, setFailure] = useState(null);
  const [outdated, setOutdated] = useState(false);

  const onRepRef = useRef(onRep);
  const onFrameRef = useRef(onFrame);
  const onVisibilityRef = useRef(onVisibility);
  useEffect(() => {
    onRepRef.current = onRep;
    onFrameRef.current = onFrame;
    onVisibilityRef.current = onVisibility;
  }, [onRep, onFrame, onVisibility]);

  // Reps and frames are passed on only once the page has said it counts the
  // exercise asked for. A ref, so the message handler never goes stale.
  const exerciseRef = useRef(exercise);
  const countingRef = useRef(false);
  useEffect(() => {
    // A new exercise is a new page load (the URL changes): start over.
    exerciseRef.current = exercise;
    countingRef.current = false;
    setReady(false);
    setCameraUp(false);
    setFailure(null);
    setOutdated(false);
  }, [exercise]);

  // Ask once, when the camera is first needed rather than at app launch.
  useEffect(() => {
    if (active && permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [active, permission, requestPermission]);

  // Pausing is a message, not an unmount: tearing the WebView down would drop
  // the camera and re-download the model on every resume.
  useEffect(() => {
    if (!ready) return;
    webviewRef.current?.postMessage(JSON.stringify({ type: paused ? 'pause' : 'resume' }));
  }, [paused, ready]);

  // Commands keyed on a value: nothing is sent on the first render with it.
  const sentKeys = useRef({ resetKey, regateKey });
  useEffect(() => {
    if (!ready) return;
    const sent = sentKeys.current;
    if (resetKey !== sent.resetKey) {
      webviewRef.current?.postMessage(JSON.stringify({ type: 'reset' }));
    }
    if (regateKey !== sent.regateKey) {
      webviewRef.current?.postMessage(JSON.stringify({ type: 'regate' }));
    }
    sentKeys.current = { resetKey, regateKey };
  }, [resetKey, regateKey, ready]);

  const handleMessage = useCallback((event) => {
    let message;
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return; // the page is the only sender, but never trust a parse
    }

    if (message.type === 'rep') {
      if (countingRef.current) onRepRef.current?.(message);
    } else if (message.type === 'frame') {
      if (countingRef.current) onFrameRef.current?.(message);
    } else if (message.type === 'visibility') {
      if (countingRef.current) {
        onVisibilityRef.current?.({
          ready: !!message.ready,
          missing: Array.isArray(message.missing) ? message.missing : [],
          progress: Number(message.progress) || 0,
        });
      }
    } else if (message.type === 'status') {
      if (message.phase === 'camera') {
        // Camera is live but the model is still downloading. Stop covering the
        // preview: these are the seconds when someone positions the phone.
        setCameraUp(true);
      } else if (message.phase === 'ready') {
        setCameraUp(true);
        // No `exercise`: a page from before there was a choice, which counts
        // push-ups whatever the URL asks for.
        const counted = message.exercise || 'pushup';
        if (counted !== exerciseRef.current) {
          countingRef.current = false;
          setOutdated(true);
          return;
        }
        countingRef.current = true;
        setReady(true);
        setFailure(null);
        setOutdated(false);
        // A page from before the gate counts at once; say so, or the screen
        // would wait for a visibility message that never comes.
        if (!message.gate) onVisibilityRef.current?.({ ready: true, missing: [], progress: 1, legacy: true });
      } else if (message.phase === 'error') {
        setFailure(message.message || 'Pose detection failed.');
      }
    }
  }, []);

  if (!active) return null;

  // useCameraPermissions resolves asynchronously and is null on first render.
  // The WebView must not mount during that window: it would call getUserMedia
  // before Android had granted CAMERA to the host app, and the page only runs
  // start() once — so it would sit on "permission denied" forever, even after
  // the user allowed access a moment later. Mounting only once `granted` is
  // true also means a later grant mounts a fresh WebView that starts cleanly.
  if (!permission) {
    return <Overlay loading title={t('pose.starting')} body={t('pose.checkingPermission')} />;
  }

  if (!permission.granted) {
    return (
      <Overlay
        title={t('pose.needCamera')}
        body={permission.canAskAgain ? t('pose.allowCamera') : t('pose.denied')}
      />
    );
  }

  const problem = failure || (outdated ? t('pose.outdated') : null);

  return (
    <View style={styles.wrap}>
      <WebView
        ref={webviewRef}
        source={{ uri: `${POSE_PAGE_URL}?exercise=${encodeURIComponent(exercise)}` }}
        onMessage={handleMessage}
        onError={({ nativeEvent }) =>
          setFailure(t('pose.loadFailed', { reason: nativeEvent.description }))
        }
        onHttpError={({ nativeEvent }) =>
          setFailure(t('pose.httpFailed', { code: nativeEvent.statusCode }))
        }
        // Without this a crashed or killed page just leaves a black box.
        onRenderProcessGone={() => setFailure(t('pose.viewCrashed'))}
        // Live camera in a WebView needs all four of these.
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        mediaCapturePermissionGrantType="grant"
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['https://*']}
        allowsProtectedMedia
        style={styles.webview}
        containerStyle={styles.webview}
      />

      {problem ? (
        <Overlay title={t('pose.problem')} body={problem} tone="error" />
      ) : ready ? null : cameraUp ? (
        <Banner text={t('pose.loadingModel')} />
      ) : (
        <Overlay loading title={t('pose.starting')} body={t('pose.asking')} />
      )}
    </View>
  );
}

/** Non-blocking status, for when the camera behind it should stay visible. */
function Banner({ text }) {
  return (
    <View style={styles.banner}>
      <ActivityIndicator color={colors.accent} size="small" />
      <Text style={styles.bannerText}>{text}</Text>
    </View>
  );
}

function Overlay({ title, body, tone, loading }) {
  return (
    <View style={styles.overlay}>
      {loading ? <ActivityIndicator color={colors.accent} style={styles.spinner} /> : null}
      <Text style={[styles.title, tone === 'error' && styles.titleError]}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

// absoluteFill, not absoluteFillObject: React Native 0.86 removed the latter,
// and spreading the missing property silently yields nothing. The stage then
// laid the WebView out zero pixels wide — a black box with the camera running.
// (react-native-web still has it, so the web build never showed the problem.)
const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFill,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  webview: { flex: 1, backgroundColor: '#000' },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: 'rgba(10,10,11,0.86)',
  },
  spinner: { marginBottom: spacing.md },
  banner: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(10,10,11,0.82)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  bannerText: { ...type.body, fontSize: 13, color: colors.textDim, flex: 1 },
  title: { ...type.title, fontSize: 17, color: colors.textDim, textAlign: 'center' },
  titleError: { color: colors.danger },
  body: {
    ...type.body,
    color: colors.textFaint,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 21,
  },
});
