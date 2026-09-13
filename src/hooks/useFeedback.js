import { useCallback, useEffect, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

const REP_SOUND = require('../../assets/rep.wav');

/**
 * Rep feedback: one haptic tap + one click per counted rep.
 *
 * The player is created once and rewound rather than recreated, so back-to-back
 * reps cannot stack players or drop the click. Every call is fire-and-forget —
 * feedback must never be able to block or fail a rep count.
 */
export function useFeedback({ soundEnabled = true, hapticsEnabled = true } = {}) {
  const playerRef = useRef(null);

  useEffect(() => {
    let player = null;
    let cancelled = false;

    (async () => {
      try {
        // mixWithOthers keeps the user's music playing under the clicks.
        await setAudioModeAsync({
          playsInSilentMode: true,
          interruptionMode: 'mixWithOthers',
          shouldPlayInBackground: false,
        });
        if (cancelled) return;
        player = createAudioPlayer(REP_SOUND);
        playerRef.current = player;
      } catch {
        // Audio unavailable (emulator without audio, permissions) — haptics
        // still carry the feedback.
      }
    })();

    return () => {
      cancelled = true;
      playerRef.current = null;
      try {
        player?.remove();
      } catch {
        /* already released */
      }
    };
  }, []);

  const repFeedback = useCallback(() => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    if (soundEnabled) {
      const player = playerRef.current;
      try {
        player?.seekTo(0);
        player?.play();
      } catch {
        /* ignore */
      }
    }
  }, [soundEnabled, hapticsEnabled]);

  const controlFeedback = useCallback(() => {
    if (hapticsEnabled) {
      Haptics.selectionAsync().catch(() => {});
    }
  }, [hapticsEnabled]);

  const finishFeedback = useCallback(() => {
    if (hapticsEnabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, [hapticsEnabled]);

  return { repFeedback, controlFeedback, finishFeedback };
}
