/**
 * The rep counter every pose analyser runs on.
 *
 * Push-ups, squats, sit-ups and jumping jacks look nothing alike to a camera,
 * but counting them is one problem. Each frame gives one number — the signal —
 * that sits high at rest and drops at the point of effort: the elbow angle of
 * a push-up, the knee angle of a squat. A rep is one rest -> effort -> rest
 * cycle, counted on the return to rest so the number matches completed reps
 * rather than attempts, the same rule the proximity path uses.
 *
 * An analyser's only job is to turn a skeleton into that signal plus the
 * readings its posture gates judge (see ./pushupAnalyzer and its siblings).
 * Everything that keeps the count honest lives here, once, so a fix to the
 * counting rules reaches every exercise:
 *
 *   hysteresis     separate effort/rest thresholds (downAngle / upAngle), so a
 *                  signal hovering on one boundary cannot oscillate and
 *                  inflate the count
 *   minPhaseMs     a phase must hold before it is committed, rejecting jitter
 *                  from a single bad inference
 *   minRepMs       the fastest believable gap between two reps
 *   adaptation     thresholds follow the range this person actually moves
 *                  through, inside absolute limits so a twitch is never a rep
 *   posture gates  judged on the rep's best frame, so one noisy inference
 *                  cannot veto good work
 *
 * Phases keep the push-up's names whatever the body does: 'up' is rest and
 * 'down' is effort, so a jumping jack with its arms overhead is 'down'. The
 * page and the app already speak in those two words.
 *
 * Pure and deterministic: same frames in, same reps out, with all timing taken
 * from the caller's timestamps rather than the clock.
 */

/**
 * Why a frame or a rep did not count. Every analyser reports in this one
 * vocabulary, so the app needs one table of coaching messages, not four.
 *
 *   lostTracking   the joints the signal needs are not visible
 *   shallow        a dip that never reached the effort threshold
 *   bodySag        push-up: hips sagging or piking
 *   notHorizontal  push-up: not in a push-up position
 *   notUpright     squat, jumping jack: not standing
 *   notLying       sit-up: did not start from lying on the back
 */
export const ISSUES = {
  LOST_TRACKING: 'lostTracking',
  SHALLOW: 'shallow',
  BODY_SAG: 'bodySag',
  NOT_HORIZONTAL: 'notHorizontal',
  NOT_UPRIGHT: 'notUpright',
  NOT_LYING: 'notLying',
};

/**
 * @param {object} opts  the analyser's merged options; the engine reads
 *   autoCalibrate, calibrationWindowMs, minRangeDeg, rangeFraction,
 *   downAngleCeiling, upAngleFloor, downAngle, upAngle, partialAngle,
 *   minPhaseMs and minRepMs. Every signal is in degrees, so the names fit all.
 * @param {Array} checks  posture gates, each
 *   {
 *     read(readings) -> number|null   this frame's value
 *     keep: 'min' | 'max'             which end of the window is its best
 *     fails(best) -> boolean          whether the best value is still wrong
 *     issue                           reported when it fails
 *     veto                            whether failing also refuses the rep
 *     window: 'rep' | 'leadIn'        what the best is taken over (below);
 *                                     'rep' when left out
 *   }
 *
 * A 'rep' check looks at the rep itself, from the moment the effort is
 * committed to the return to rest. A 'leadIn' check looks at the rest before
 * the effort instead, from the end of the previous rep, and is judged as the
 * effort begins — "started from lying down" is a question about where the rep
 * came from, which the rep's own frames cannot answer. Its issue is reported
 * then, so the advice arrives in time to act on, and again if the rep is
 * refused for it. A check with no readable frame at all passes: unknown is not
 * wrong.
 */
export function createRepEngine(opts, checks = []) {
  let phase = 'unknown'; // 'unknown' | 'up' (rest) | 'down' (effort)
  let reps = 0;
  let lastRepAt = -Infinity;

  let candidate = null; // phase we are waiting to confirm
  let candidateSince = 0;

  // A dip taken while still at rest, i.e. one that never got deep enough to
  // commit an effort. Tracked outside the phase machine because a shallow dip
  // produces no phase change for the machine to react to.
  let inDip = false;
  let dipMin = Infinity;

  /** Recent signal values, for deriving this person's range of movement. */
  let samples = [];

  /** Best reading of each check over its window so far. */
  let best = checks.map(startOf);

  function startOf(check) {
    return check.keep === 'max' ? -Infinity : Infinity;
  }

  function fold(i, readings) {
    const value = checks[i].read(readings);
    if (!Number.isFinite(value)) return;
    best[i] = checks[i].keep === 'max' ? Math.max(best[i], value) : Math.min(best[i], value);
  }

  function failed(i) {
    return Number.isFinite(best[i]) && checks[i].fails(best[i]);
  }

  /**
   * Thresholds for the current frame: adapted to the observed range once there
   * is enough of it, otherwise the fixed fallbacks. Clamped so a small range
   * cannot turn a twitch into a rep.
   */
  function thresholdsFor(signal, timestamp) {
    if (!opts.autoCalibrate) {
      return { down: opts.downAngle, up: opts.upAngle, adapted: false };
    }

    samples.push({ t: timestamp, value: signal });
    const cutoff = timestamp - opts.calibrationWindowMs;
    if (samples.length > 4 && samples[0].t < cutoff) {
      samples = samples.filter((s) => s.t >= cutoff);
    }

    let min = Infinity;
    let max = -Infinity;
    for (const s of samples) {
      if (s.value < min) min = s.value;
      if (s.value > max) max = s.value;
    }

    const range = max - min;
    if (!Number.isFinite(range) || range < opts.minRangeDeg) {
      return { down: opts.downAngle, up: opts.upAngle, adapted: false };
    }

    const margin = range * opts.rangeFraction;
    return {
      down: Math.min(min + margin, opts.downAngleCeiling),
      up: Math.max(max - margin, opts.upAngleFloor),
      adapted: true,
      observedMin: min,
      observedMax: max,
    };
  }

  function clearDip() {
    inDip = false;
    dipMin = Infinity;
  }

  return {
    get reps() {
      return reps;
    },

    get phase() {
      return phase;
    },

    reset() {
      phase = 'unknown';
      reps = 0;
      lastRepAt = -Infinity;
      candidate = null;
      candidateSince = 0;
      samples = [];
      clearDip();
      best = checks.map(startOf);
    },

    /**
     * Feed one frame.
     * @param {number|null} signal  low = effort; not a number = not tracked
     * @param {object} readings     whatever the checks read
     * @param {number} timestamp    milliseconds, monotonic
     */
    push(signal, readings, timestamp) {
      if (!Number.isFinite(signal)) {
        // Hold the phase rather than guessing: a dropped frame mid-rep must
        // not be read as the subject having come back to rest.
        candidate = null;
        return {
          reps,
          phase,
          repCompleted: false,
          partialRep: false,
          issues: [ISSUES.LOST_TRACKING],
          tracking: false,
          thresholds: null,
          signal: null,
        };
      }

      checks.forEach((check, i) => {
        // A lead-in stops gathering once the effort starts: what happens
        // during the rep says nothing about where it started from.
        if (check.window !== 'leadIn' || phase !== 'down') fold(i, readings);
      });

      const limits = thresholdsFor(signal, timestamp);

      // Instantaneous reading; null in the hysteresis band, where we hold.
      let observed = null;
      if (signal <= limits.down) observed = 'down';
      else if (signal >= limits.up) observed = 'up';

      let repCompleted = false;
      let partialRep = false;
      const issues = [];

      // Shallow-dip detection, before the phase machine. A dip that never
      // crosses the effort threshold gives the machine nothing to see — but
      // "go further" is exactly the feedback that moment calls for.
      if (phase === 'up') {
        if (signal < limits.up) {
          inDip = true;
          dipMin = Math.min(dipMin, signal);
        } else if (inDip) {
          // "Too shallow to count" is relative to where the effort threshold
          // actually sits, so the advice stays honest under adaptation. A dip
          // that never got within (upAngle - partialAngle) of it is noise or
          // fidgeting, not an attempt.
          const wasShallow = dipMin <= limits.down + (opts.upAngle - opts.partialAngle);
          clearDip();
          if (wasShallow) {
            partialRep = true;
            issues.push(ISSUES.SHALLOW);
          }
        }
      }

      if (observed && observed !== phase) {
        if (candidate !== observed) {
          candidate = observed;
          candidateSince = timestamp;
        }

        if (timestamp - candidateSince >= opts.minPhaseMs) {
          const previous = phase;
          phase = observed;
          candidate = null;

          if (phase === 'down') {
            // A real effort supersedes any dip we were tracking, so it must
            // not also be reported as a shallow rep on the way back.
            clearDip();
            checks.forEach((check, i) => {
              if (check.window === 'leadIn') {
                if (failed(i)) issues.push(check.issue);
              } else {
                best[i] = startOf(check);
                fold(i, readings);
              }
            });
          }

          if (phase === 'up' && previous === 'down') {
            // A full cycle finished. Decide whether it earns a count: a failed
            // check with a veto refuses it, and so does arriving impossibly
            // soon after the last one. A failed check without one is advice.
            let vetoed = false;
            checks.forEach((check, i) => {
              if (!failed(i)) return;
              issues.push(check.issue);
              if (check.veto) vetoed = true;
            });

            if (!vetoed && timestamp - lastRepAt >= opts.minRepMs) {
              reps += 1;
              lastRepAt = timestamp;
              repCompleted = true;
            }
            clearDip();
            best = checks.map(startOf);
          }
        }
      } else if (observed === phase) {
        candidate = null;
      }

      return {
        reps,
        phase,
        repCompleted,
        partialRep,
        issues,
        tracking: true,
        thresholds: limits,
        signal,
      };
    },
  };
}

/**
 * The analyser object every exercise hands out, around an engine: measure the
 * skeleton, feed the signal and readings in, and return the engine's verdict
 * with the readings alongside, for the UI and the debug HUD.
 *
 * @param {string} exercise   which exercise this counts (an exercise id)
 * @param {object} engine     from createRepEngine
 * @param {Function} measure  (pose, timestamp) -> { tracking, [signalKey], ...readings };
 *   the timestamp is for a measure that keeps a little state of its own (the
 *   squat's standing height)
 * @param {string} signalKey  which reading is the signal
 * @param {Function} [onReset]  clears that state when the analyser is reset
 */
export function poseAnalyzer(exercise, engine, measure, signalKey, onReset) {
  return {
    exercise,

    get reps() {
      return engine.reps;
    },

    get phase() {
      return engine.phase;
    },

    reset() {
      engine.reset();
      if (onReset) onReset();
    },

    /**
     * Feed one pose frame.
     * @param {object} pose       normalised joints (see ./landmarks)
     * @param {number} timestamp  milliseconds, monotonic
     */
    push(pose, timestamp) {
      const frame = measure(pose, timestamp);
      return { ...frame, ...engine.push(frame[signalKey], frame, timestamp) };
    },
  };
}
