import { useCallback, useEffect, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

/** Least time between two spoken form mistakes, and before the same one again. */
const COACH_GAP_MS = 2500;
const COACH_REPEAT_MS = 6000;

const SOUNDS = {
  rep: require('../../assets/rep.wav'),
  tick: require('../../assets/tick.wav'),
  go: require('../../assets/go.wav'),
  done: require('../../assets/done.wav'),
};

/**
 * Everything the user hears and feels: a haptic tap and a click per rep, the
 * spoken rep number, countdown ticks, and the cue sounds around a set.
 *
 * Players are created once and rewound rather than recreated, so back-to-back
 * reps cannot stack players or drop a click. Every call is fire-and-forget —
 * feedback must never be able to block or fail a rep count.
 *
 * @param {object}  settings   soundEnabled / hapticsEnabled / voiceEnabled /
 *                             coachVoiceEnabled
 * @param {string}  speechTag  BCP 47 tag for the voice, e.g. 'vi-VN'
 */
export function useFeedback(
  { soundEnabled = true, hapticsEnabled = true, voiceEnabled = true, coachVoiceEnabled = true } = {},
  speechTag = 'en-US',
) {
  const playersRef = useRef({});
  const coachSaidRef = useRef({ at: 0, text: null });

  useEffect(() => {
    let created = {};
    let cancelled = false;

    (async () => {
      try {
        // mixWithOthers keeps the user's music playing under the cues.
        await setAudioModeAsync({
          playsInSilentMode: true,
          interruptionMode: 'mixWithOthers',
          shouldPlayInBackground: false,
        });
        if (cancelled) return;
        for (const [name, source] of Object.entries(SOUNDS)) {
          created[name] = createAudioPlayer(source);
        }
        playersRef.current = created;
      } catch {
        // Audio unavailable (emulator without audio) — haptics and voice
        // still carry the feedback.
      }
    })();

    return () => {
      cancelled = true;
      playersRef.current = {};
      for (const player of Object.values(created)) {
        try {
          player.remove();
        } catch {
          /* already released */
        }
      }
      created = {};
    };
  }, []);

  const play = useCallback(
    (name) => {
      if (!soundEnabled) return;
      const player = playersRef.current[name];
      try {
        player?.seekTo(0);
        player?.play();
      } catch {
        /* ignore */
      }
    },
    [soundEnabled],
  );

  /**
   * Speak, cutting off whatever was still being said. Reps can land faster
   * than a number takes to say; queueing them would leave the voice counting
   * long after the set ended.
   */
  const say = useCallback(
    (text) => {
      if (!voiceEnabled || !text) return;
      try {
        Speech.stop();
        Speech.speak(String(text), { language: speechTag, rate: 1.1 });
      } catch {
        /* no TTS engine */
      }
    },
    [voiceEnabled, speechTag],
  );

  /**
   * Say a form mistake out loud ("Keep your body straight"), so it is heard
   * from the floor where the screen cannot be read. Its own switch, apart from
   * the rep count. Not too often: the camera reports the same fault frame
   * after frame, so a message waits COACH_GAP_MS after any other and
   * COACH_REPEAT_MS before it is said again. `force` skips both, for news
   * that must not wait (back in frame).
   */
  const sayCoach = useCallback(
    (text, { force = false } = {}) => {
      if (!coachVoiceEnabled || !text) return;
      const now = Date.now();
      const last = coachSaidRef.current;
      if (!force && now - last.at < COACH_GAP_MS) return;
      if (!force && text === last.text && now - last.at < COACH_REPEAT_MS) return;
      coachSaidRef.current = { at: now, text };
      try {
        Speech.stop();
        Speech.speak(String(text), { language: speechTag, rate: 1.05 });
      } catch {
        /* no TTS engine */
      }
    },
    [coachVoiceEnabled, speechTag],
  );

  const repFeedback = useCallback(
    (count) => {
      if (hapticsEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }
      if (voiceEnabled && Number.isFinite(count)) {
        say(count);
      } else {
        play('rep');
      }
    },
    [hapticsEnabled, voiceEnabled, say, play],
  );

  const controlFeedback = useCallback(() => {
    if (hapticsEnabled) {
      Haptics.selectionAsync().catch(() => {});
    }
  }, [hapticsEnabled]);

  const tickFeedback = useCallback(() => {
    play('tick');
    if (hapticsEnabled) Haptics.selectionAsync().catch(() => {});
  }, [play, hapticsEnabled]);

  const goFeedback = useCallback(
    (spoken) => {
      play('go');
      if (hapticsEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      }
      say(spoken);
    },
    [play, hapticsEnabled, say],
  );

  const doneFeedback = useCallback(
    (spoken) => {
      play('done');
      if (hapticsEnabled) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      say(spoken);
    },
    [play, hapticsEnabled, say],
  );

  return { repFeedback, controlFeedback, tickFeedback, goFeedback, doneFeedback, say, sayCoach };
}
