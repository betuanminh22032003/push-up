import { useCallback, useEffect, useRef, useState } from 'react';

import { fromMediaPipe, SKELETON_BONES } from './landmarks';
import { createPushupAnalyzer, ISSUES } from './pushupAnalyzer';
import { colors } from '../theme/theme';

/**
 * Camera + pose detection for the web build.
 *
 * Everything here is glue: grab frames, run MediaPipe, hand normalised
 * landmarks to the analyser, draw the result. All the counting rules live in
 * pushupAnalyzer.js, which is why they can be tested without a camera.
 *
 * Metro resolves this file only for web. The native build gets PoseStage.js,
 * which explains the dev-build requirement instead — expo-camera exposes no
 * frame processor, so live ML on native needs VisionCamera.
 */

const MEDIAPIPE_VERSION = '1.0.1';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;
const WASM_ROOT = `${CDN}/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

let visionPromise = null;

/**
 * Load MediaPipe at runtime rather than bundling it.
 *
 * Metro cannot parse any of the shipped builds — each contains
 * `import(t.toString())` for the WASM loader, which its static analysis
 * rejects outright ("Invalid call at line 1"). Building the import through
 * `new Function` hides it from that analysis, so the browser fetches the
 * library itself. The WASM and the model already come from the network, so
 * this adds no new runtime dependency, and it keeps ~150KB out of the bundle.
 */
function loadVision() {
  if (!visionPromise) {
    const dynamicImport = new Function('url', 'return import(url);');
    visionPromise = dynamicImport(`${CDN}/vision_bundle.mjs`).catch((e) => {
      visionPromise = null; // let a later attempt retry after a network blip
      throw e;
    });
  }
  return visionPromise;
}

/** Confidence below which a joint is not drawn. */
const DRAW_MIN_SCORE = 0.4;

/**
 * Inference rate. Deliberately not requestAnimationFrame: rAF is driven by the
 * compositor, so it throttles to nothing whenever the page is not painting,
 * which would stall counting mid-set. It also fires at display refresh — up to
 * 120Hz — and running pose inference that often burns battery for no gain,
 * since a push-up lasts about a second. 30fps is well past enough to catch the
 * top and bottom of every rep.
 */
const TARGET_FPS = 30;
const FRAME_INTERVAL_MS = Math.round(1000 / TARGET_FPS);

/**
 * If the video's currentTime stops advancing we would skip every frame
 * forever, so force an inference after this long regardless.
 */
const STALE_FRAME_MS = 250;

/** Consecutive inference failures before we stop claiming everything is fine. */
const MAX_CONSECUTIVE_ERRORS = 30;

export function PoseStage({ active, paused, onRep, onFrame, analyzerOptions }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const landmarkerRef = useRef(null);
  const analyzerRef = useRef(null);
  const timerRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);

  // loading -> camera (stream live, model still downloading) -> ready | error
  const [phase, setPhase] = useState('loading');
  const [error, setError] = useState(null);

  // Held in refs so a new callback identity never restarts the camera. Pausing
  // goes through a ref for the same reason: tearing the camera down on every
  // pause would mean reloading the model on every resume.
  const onRepRef = useRef(onRep);
  const onFrameRef = useRef(onFrame);
  const pausedRef = useRef(paused);
  useEffect(() => {
    onRepRef.current = onRep;
    onFrameRef.current = onFrame;
    pausedRef.current = paused;
  }, [onRep, onFrame, paused]);

  const draw = useCallback((pose, result) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    if (!pose) return;

    const at = (joint) => {
      const p = pose[joint];
      if (!p || p.score < DRAW_MIN_SCORE) return null;
      return { x: p.x * width, y: p.y * height };
    };

    ctx.strokeStyle = result?.tracking ? colors.accent : colors.textFaint;
    ctx.lineWidth = Math.max(2, width / 180);
    ctx.lineCap = 'round';

    for (const [from, to] of SKELETON_BONES) {
      const a = at(from);
      const b = at(to);
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    ctx.fillStyle = result?.tracking ? colors.accent : colors.textFaint;
    for (const joint of Object.keys(pose)) {
      const p = at(joint);
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(3, width / 240), 0, Math.PI * 2);
      ctx.fill();
    }
  }, []);

  // --- camera + model lifecycle --------------------------------------------
  useEffect(() => {
    if (!active) return undefined;

    let cancelled = false;
    let stream = null;

    let consecutiveErrors = 0;
    let lastInferenceAt = 0;

    const tick = () => {
      if (cancelled) return;
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;
      const analyzer = analyzerRef.current;

      if (video && landmarker && analyzer && video.readyState >= 2) {
        // Skip frames we have already seen, but never wedge if currentTime
        // stops advancing on a misbehaving stream.
        const now = performance.now();
        const isNewFrame = video.currentTime !== lastVideoTimeRef.current;
        const isStale = now - lastInferenceAt >= STALE_FRAME_MS;

        if (isNewFrame || isStale) {
          lastVideoTimeRef.current = video.currentTime;
          lastInferenceAt = now;
          try {
            const detection = landmarker.detectForVideo(video, now);
            const raw = detection?.landmarks?.[0] ?? null;
            const pose = raw ? fromMediaPipe(raw) : null;

            if (pausedRef.current) {
              // Keep the preview and skeleton live so the user can reframe
              // themselves, but count nothing while the set is paused.
              draw(pose, { tracking: !!pose });
            } else {
              const result = pose
                ? analyzer.push(pose, now)
                : { tracking: false, issues: [ISSUES.LOST_TRACKING], reps: analyzer.reps };

              if (result.repCompleted) onRepRef.current?.(result);
              onFrameRef.current?.(result);
              draw(pose, result);
            }
            consecutiveErrors = 0;
          } catch (e) {
            // One failed inference must not kill the loop, but failing every
            // frame is not a blip — say so rather than sitting there looking
            // like a working camera that counts nothing.
            consecutiveErrors += 1;
            if (consecutiveErrors === MAX_CONSECUTIVE_ERRORS) {
              setPhase('error');
              setError(`Pose detection keeps failing: ${e?.message || e}`);
            }
          }
        }
      }
    };

    (async () => {
      try {
        setPhase('loading');
        setError(null);

        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) return;

        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();
        if (cancelled) return;

        // Stop covering the preview: the model download takes a few seconds,
        // and that is exactly when someone needs to see the frame to position
        // themselves.
        setPhase('camera');

        const { FilesetResolver, PoseLandmarker } = await loadVision();
        if (cancelled) return;

        const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);
        if (cancelled) return;

        const landmarker = await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
        });
        if (cancelled) {
          landmarker.close();
          return;
        }

        landmarkerRef.current = landmarker;
        analyzerRef.current = createPushupAnalyzer({
          ...analyzerOptions,
          aspect: (video.videoWidth || 640) / (video.videoHeight || 480),
        });

        setPhase('ready');
        timerRef.current = setInterval(tick, FRAME_INTERVAL_MS);
      } catch (e) {
        if (cancelled) return;
        setPhase('error');
        setError(
          e?.name === 'NotAllowedError'
            ? 'Camera permission denied. Allow camera access and start again.'
            : e?.message || 'Could not start the camera.',
        );
      }
    })();

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      lastVideoTimeRef.current = -1;

      try {
        landmarkerRef.current?.close();
      } catch {
        /* already closed */
      }
      landmarkerRef.current = null;
      analyzerRef.current = null;

      stream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
    // analyzerOptions is intentionally omitted: changing thresholds mid-set
    // must not tear down the camera. They are read once, at set start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, draw]);

  return (
    <div style={styles.wrap}>
      <video ref={videoRef} playsInline muted style={styles.video} />
      <canvas ref={canvasRef} style={styles.canvas} />
      {phase === 'error' ? (
        <div style={styles.overlay}>
          <span style={{ ...styles.overlayText, color: colors.danger }}>{error}</span>
        </div>
      ) : phase === 'camera' ? (
        <div style={styles.banner}>Loading the model… you can frame yourself now</div>
      ) : phase !== 'ready' ? (
        <div style={styles.overlay}>
          <span style={styles.overlayText}>Starting camera…</span>
        </div>
      ) : null}
    </div>
  );
}

/** Plain CSS: these are real DOM nodes, not react-native-web components. */
const styles = {
  wrap: {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
    borderRadius: 20,
    background: '#000',
  },
  video: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    // Mirror the preview so moving left on screen matches moving left in life.
    transform: 'scaleX(-1)',
  },
  canvas: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transform: 'scaleX(-1)',
    pointerEvents: 'none',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    textAlign: 'center',
    background: 'rgba(10,10,11,0.78)',
  },
  overlayText: { color: colors.textDim, fontSize: 14, lineHeight: 1.5 },
  banner: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    padding: '9px 14px',
    borderRadius: 999,
    background: 'rgba(10,10,11,0.82)',
    border: `1px solid ${colors.border}`,
    color: colors.textDim,
    fontSize: 13,
    textAlign: 'center',
  },
};
