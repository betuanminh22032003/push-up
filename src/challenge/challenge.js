import { EXERCISE_IDS, getExercise } from '../exercises/exercises';
import { CHALLENGE_DURATIONS } from './codec';

/**
 * Timed challenges: the rules, the clock and the scoring, apart from any UI
 * so the Node suite can play a whole challenge through.
 *
 * Two formats:
 *   'reps'  as many reps as possible in 30, 60 or 120 seconds
 *   'hold'  the longest hold (plank, wall sit...): the clock runs until the
 *           form breaks for HOLD_BREAK_SECONDS, or HOLD_CAP_SECONDS pass
 *
 * Ranked challenges count only reps the camera saw (RANKED_SOURCE): tapping
 * or the motion sensor are too easy to fake for a score someone else has to
 * beat. That does not make a score proof of anything; see ./codec.js.
 */

export const RANKED_SOURCE = 'ai';
export const DEFAULT_DURATION = 60;
export const HOLD_CAP_SECONDS = 600;
/** A hold that has stopped counting for this long is over. */
export const HOLD_BREAK_SECONDS = 3;
/** Time to get into the hold once the clock starts before it counts as nothing. */
export const HOLD_START_GRACE_SECONDS = 15;
/** Seconds to get into position between the camera seeing you and the start. */
export const CHALLENGE_COUNTDOWN_SECONDS = 3;

/** The formats an exercise can be challenged in. */
export function formatsFor(exerciseId) {
  const exercise = getExercise(exerciseId);
  if (exercise.kind === 'hold') return [{ format: 'hold', durationSeconds: 0 }];
  return CHALLENGE_DURATIONS.map((durationSeconds) => ({ format: 'reps', durationSeconds }));
}

/** Whether this app can run a decoded challenge: a known exercise, in a format it allows. */
export function isPlayable(challenge) {
  if (!challenge || !EXERCISE_IDS.includes(challenge.exerciseId)) return false;
  const hold = getExercise(challenge.exerciseId).kind === 'hold';
  return hold ? challenge.format === 'hold' : challenge.format === 'reps';
}

/** Whether a source may set a ranked score. */
export function isRankedSource(sourceId) {
  return sourceId === RANKED_SOURCE;
}

/** 'win', 'lose' or 'draw', from my side. */
export function compareScores(mine, theirs) {
  if (mine > theirs) return 'win';
  if (mine < theirs) return 'lose';
  return 'draw';
}

/**
 * One run of a challenge. Feed it the camera's reps (`rep`) and the time
 * (`tick`); it says when it is over and what the score is.
 *
 * The clock starts at `start(now)`, once the camera sees the whole body and
 * the countdown is done. Reps before that or after the time is up are
 * refused, so a rep finishing a hair after the buzzer does not count.
 *
 * @param {{ format: 'reps'|'hold', durationSeconds: number }} rules
 */
export function createChallengeRun({ format, durationSeconds }) {
  const hold = format === 'hold';
  // A hold's limit is its score cap (below); the clock only backstops it,
  // with room for the seconds it took to get into position.
  const limitMs = (hold ? HOLD_CAP_SECONDS + HOLD_START_GRACE_SECONDS : durationSeconds) * 1000;
  let startedAt = null;
  let lastRepAt = null;
  let score = 0;
  let over = false;
  let reason = null;
  let endedAt = null;

  const end = (why, at) => {
    if (over) return;
    over = true;
    reason = why;
    endedAt = at;
  };

  const check = (now) => {
    if (startedAt === null || over) return;
    if (now - startedAt >= limitMs) {
      end('time', startedAt + limitMs);
    } else if (hold && lastRepAt !== null && now - lastRepAt >= HOLD_BREAK_SECONDS * 1000) {
      // The hold ended at its last counted second, not when we noticed.
      end('broken', lastRepAt);
    } else if (hold && lastRepAt === null && now - startedAt >= HOLD_START_GRACE_SECONDS * 1000) {
      end('broken', now);
    }
  };

  return {
    get started() {
      return startedAt !== null;
    },
    get over() {
      return over;
    },
    get score() {
      return score;
    },
    get reason() {
      return reason;
    },
    start(now) {
      if (startedAt === null) startedAt = now;
    },
    /** A rep (or, for a hold, a second held) from the camera. Returns whether it counted. */
    rep(now) {
      check(now);
      if (startedAt === null || over || now - startedAt > limitMs) return false;
      score += 1;
      lastRepAt = now;
      if (hold && score >= HOLD_CAP_SECONDS) end('time', now);
      return true;
    },
    /** Seconds left on the clock ('reps'), or seconds so far ('hold'), and whether it is over. */
    tick(now) {
      check(now);
      const at = over ? endedAt : now;
      const elapsedMs = startedAt === null ? 0 : Math.max(0, at - startedAt);
      return {
        over,
        reason,
        score,
        remaining: hold ? null : Math.max(0, Math.ceil((limitMs - elapsedMs) / 1000)),
        elapsed: Math.floor(elapsedMs / 1000),
      };
    },
    /** The user stopped it. */
    stop(now) {
      end('stopped', now);
    },
    /** Seconds the run lasted, for the session it is saved as. */
    durationSeconds() {
      if (startedAt === null) return 0;
      return Math.round(((endedAt ?? lastRepAt ?? startedAt) - startedAt) / 1000);
    },
  };
}

/**
 * The record kept in the local list of challenges.
 * @param {'sent'|'received'} direction
 * @param {object} challenge  the decoded challenge (received) or my own (sent)
 * @param {object} extra      { myScore, now }
 */
export function challengeRecord(direction, challenge, { myScore = null, now = Date.now() } = {}) {
  const received = direction === 'received';
  return {
    id: `${received ? 'r' : 's'}-${challenge.id}`,
    at: now,
    direction,
    challengeId: challenge.id,
    replyTo: challenge.replyTo ?? null,
    exerciseId: challenge.exerciseId,
    format: challenge.format,
    durationSeconds: challenge.durationSeconds,
    opponent: received ? challenge.name : null,
    theirScore: received ? challenge.score : null,
    myScore: received ? myScore : challenge.score,
    result: received && Number.isFinite(myScore) ? compareScores(myScore, challenge.score) : null,
  };
}
