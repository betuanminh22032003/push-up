import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
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
 *
 * When something goes wrong (no camera, no network, the page or its renderer
 * dies) the stage says so in the app's language and offers Try again, which
 * loads the page afresh; a page that never gets going is given up on after a
 * while rather than spinning forever. `onBlockingChange(true)` while such a
 * cover is up, so the screen can clear its own figures off it.
 *
 * In the background Android takes the camera away from the app, so the page
 * is unloaded there and loaded again on the way back.
 */

/** Only the published page may drive the counter. */
const PAGE_ORIGIN = (POSE_PAGE_URL.match(/^https:\/\/[^/]+/) || [''])[0];

/** How long the page may take to show the camera, then to load the model. */
const CAMERA_TIMEOUT_MS = 25 * 1000;
const MODEL_TIMEOUT_MS = 90 * 1000;

/** The page's error codes (pages from protocol 4 on send one) and what to tell the user. */
const ERROR_KEYS = {
  denied: 'pose.err.denied',
  busy: 'pose.err.busy',
  cameraEnded: 'pose.err.cameraEnded',
  load: 'pose.err.load',
  inference: 'pose.err.inference',
};

function failureFromPage(message) {
  if (ERROR_KEYS[message.code]) return { key: ERROR_KEYS[message.code] };
  // A page from before error codes: the one message worth telling apart.
  if (message.message === 'camera track ended') return { key: ERROR_KEYS.cameraEnded };
  return { key: 'pose.err.generic' };
}
export function PoseStage({
  active,
  paused,
  onRep,
  onFrame,
  onVisibility,
  resetKey,
  regateKey,
  exercise = 'pushup',
  onBlockingChange,
}) {
  const t = useT();
  const webviewRef = useRef(null);
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [cameraUp, setCameraUp] = useState(false);
  // { key, params } of what went wrong, shown in the app's language.
  const [failure, setFailure] = useState(null);
  const [outdated, setOutdated] = useState(false);
  // Bumped to load the page again from scratch (Try again).
  const [reloadKey, setReloadKey] = useState(0);
  // After the page's renderer died, it runs the model on the CPU: the GPU
  // delegate takes the whole renderer down on some Android GPUs.
  const [forceCpu, setForceCpu] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');

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
  // A page load starts from nothing: a new exercise (the URL changes), Try
  // again, or coming back from the background.
  const resetPage = useCallback(() => {
    countingRef.current = false;
    setReady(false);
    setCameraUp(false);
    setFailure(null);
    setOutdated(false);
  }, []);
  useEffect(() => {
    exerciseRef.current = exercise;
    resetPage();
  }, [exercise, resetPage]);

  const retry = useCallback(() => {
    resetPage();
    setReloadKey((k) => k + 1);
  }, [resetPage]);

  // Ask once, when the camera is first needed rather than at app launch. A
  // refusal is answered from the cover's button, not by asking again at once.
  const askedRef = useRef(false);
  useEffect(() => {
    if (active && permission && !permission.granted && permission.canAskAgain && !askedRef.current) {
      askedRef.current = true;
      requestPermission();
    }
  }, [active, permission, requestPermission]);

  // Background: unload the page (the camera is gone anyway); foreground: load
  // it again, and re-read the permission, which may have been granted in Settings.
  useEffect(() => {
    if (!active) return undefined;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        setForeground(false);
        resetPage();
      } else if (state === 'active') {
        setForeground(true);
        getPermission?.().catch?.(() => {});
      }
    });
    return () => sub.remove();
  }, [active, resetPage, getPermission]);

  // A page that never gets the camera going, or never loads the model, is
  // given up on with a reason and Try again, instead of spinning forever.
  const mounted = active && foreground && !!permission?.granted;
  useEffect(() => {
    if (!mounted || ready || failure || outdated) return undefined;
    const id = setTimeout(
      () => setFailure({ key: 'pose.err.timeout' }),
      cameraUp ? MODEL_TIMEOUT_MS : CAMERA_TIMEOUT_MS,
    );
    return () => clearTimeout(id);
  }, [mounted, ready, failure, outdated, cameraUp, reloadKey]);

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
    const from = event.nativeEvent.url;
    if (PAGE_ORIGIN && typeof from === 'string' && !from.startsWith(PAGE_ORIGIN)) return;
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
        countingRef.current = false;
        setFailure(failureFromPage(message));
      }
    }
  }, []);

  const blocking =
    active &&
    foreground &&
    (!permission || !permission.granted || !!failure || outdated || (!ready && !cameraUp));
  useEffect(() => {
    onBlockingChange?.(blocking);
  }, [blocking, onBlockingChange]);
  useEffect(() => () => onBlockingChange?.(false), [onBlockingChange]);

  if (!active || !foreground) return null;

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
    // Asked already, or not allowed to ask: the button asks again where
    // Android still lets it, and opens the app's settings where it does not.
    return (
      <Overlay
        title={t('pose.needCamera')}
        body={permission.canAskAgain ? t('pose.allowCamera') : t('pose.denied')}
        action={
          permission.canAskAgain
            ? { label: t('pose.allowButton'), onPress: requestPermission }
            : { label: t('pose.openSettings'), onPress: () => Linking.openSettings().catch(() => {}) }
        }
      />
    );
  }

  const problem = failure ? t(failure.key, failure.params) : outdated ? t('pose.outdated') : null;
  const query = `?exercise=${encodeURIComponent(exercise)}${forceCpu ? '&delegate=cpu' : ''}`;

  return (
    <View style={styles.wrap}>
      <WebView
        key={`${exercise}-${reloadKey}`}
        ref={webviewRef}
        source={{ uri: `${POSE_PAGE_URL}${query}` }}
        onMessage={handleMessage}
        onError={() => setFailure({ key: 'pose.loadFailed' })}
        onHttpError={({ nativeEvent }) =>
          setFailure({ key: 'pose.httpFailed', params: { code: nativeEvent.statusCode } })
        }
        // The library's own error view is English and sits under the cover.
        renderError={() => <View style={styles.webview} />}
        // A dead renderer cannot be used again: the view is replaced. The
        // first time it is tried again on the CPU at once, since the GPU
        // delegate is the usual cause; after that it is up to the user.
        onRenderProcessGone={() => {
          resetPage();
          if (!forceCpu) {
            setForceCpu(true);
            setReloadKey((k) => k + 1);
          } else {
            setFailure({ key: 'pose.viewCrashed' });
          }
        }}
        // Only the detector page loads here; any other navigation is refused.
        originWhitelist={[PAGE_ORIGIN || 'https://*']}
        onShouldStartLoadWithRequest={({ url }) => !PAGE_ORIGIN || url.startsWith(PAGE_ORIGIN)}
        // Live camera in a WebView needs all four of these.
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        mediaCapturePermissionGrantType="grant"
        javaScriptEnabled
        domStorageEnabled
        style={styles.webview}
        containerStyle={styles.webview}
      />

      {problem ? (
        <Overlay
          title={t('pose.problem')}
          body={problem}
          tone="error"
          action={outdated ? null : { label: t('pose.retry'), onPress: retry }}
        />
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

function Overlay({ title, body, tone, loading, action }) {
  return (
    <View style={styles.overlay}>
      {loading ? <ActivityIndicator color={colors.accent} style={styles.spinner} /> : null}
      <Text style={[styles.title, tone === 'error' && styles.titleError]}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {action ? (
        <Pressable
          onPress={action.onPress}
          hitSlop={8}
          accessibilityRole="button"
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
        >
          <Text style={styles.actionText}>{action.label}</Text>
        </Pressable>
      ) : null}
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
  action: {
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  actionPressed: { opacity: 0.7 },
  actionText: { fontSize: 15, fontWeight: '700', color: colors.accent },
});
