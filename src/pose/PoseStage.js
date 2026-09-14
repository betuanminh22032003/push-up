import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import { WebView } from 'react-native-webview';

import { POSE_PAGE_URL } from '../config';
import { colors, spacing, type } from '../theme/theme';

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
 */
export function PoseStage({ active, paused, onRep, onFrame }) {
  const webviewRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState(null);

  const onRepRef = useRef(onRep);
  const onFrameRef = useRef(onFrame);
  useEffect(() => {
    onRepRef.current = onRep;
    onFrameRef.current = onFrame;
  }, [onRep, onFrame]);

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

  const handleMessage = useCallback((event) => {
    let message;
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return; // the page is the only sender, but never trust a parse
    }

    if (message.type === 'rep') {
      onRepRef.current?.(message);
    } else if (message.type === 'frame') {
      onFrameRef.current?.(message);
    } else if (message.type === 'status') {
      if (message.phase === 'ready') {
        setReady(true);
        setFailure(null);
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
    return <Overlay loading title="Starting camera" body="Checking camera permission…" />;
  }

  if (!permission.granted) {
    return (
      <Overlay
        title="Camera access needed"
        body={
          permission.canAskAgain
            ? 'Allow camera access to count push-ups with the camera.'
            : 'Camera access was denied. Enable it for Expo Go in your device settings, or switch to Proximity or Tap mode.'
        }
      />
    );
  }

  return (
    <View style={styles.wrap}>
      <WebView
        ref={webviewRef}
        source={{ uri: POSE_PAGE_URL }}
        onMessage={handleMessage}
        onError={({ nativeEvent }) =>
          setFailure(`Could not load the detector page: ${nativeEvent.description}`)
        }
        onHttpError={({ nativeEvent }) =>
          setFailure(`Detector page returned HTTP ${nativeEvent.statusCode}.`)
        }
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

      {failure ? (
        <Overlay title="Detector problem" body={failure} tone="error" />
      ) : !ready ? (
        <Overlay loading title="Starting camera" body="Loading the pose model…" />
      ) : null}
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

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  webview: { flex: 1, backgroundColor: '#000' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: 'rgba(10,10,11,0.86)',
  },
  spinner: { marginBottom: spacing.md },
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
