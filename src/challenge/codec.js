/**
 * Challenge links: a challenge packed into a URL, with no server anywhere.
 *
 *   https://betuanminh22032003.github.io/push-up/challenge.html#<token>
 *   hitdat://challenge?c=<token>
 *
 * The token is the challenge as JSON, UTF-8, base64url, then a dot and a
 * checksum of that text. On the https page it sits in the fragment, which a
 * browser never sends, so GitHub Pages serves a static file and learns nothing.
 *
 * The checksum catches a link cut short or mangled by a chat app. It is NOT
 * anti-cheat: anyone can edit the JSON and recompute it, and nothing here
 * pretends otherwise. A challenge is between friends.
 *
 * Pure, no imports, and no globals beyond encodeURIComponent: the same file
 * is inlined into docs/challenge.html by scripts/build-challenge-page.mjs, and
 * the Node suite runs it as is.
 *
 * Payload fields (short keys keep the link short):
 *   v  version, CHALLENGE_VERSION
 *   e  exercise id (src/exercises/exercises.js)
 *   f  'reps' (most reps in d seconds) or 'hold' (longest hold)
 *   d  seconds for 'reps'; 0 for 'hold'
 *   n  challenger's display name, may be ''
 *   s  score: reps, or seconds held
 *   t  when, unix seconds
 *   i  short random id
 *   r  optional: the id of the challenge this one answers (a rematch)
 */

export const CHALLENGE_VERSION = 1;
export const CHALLENGE_PAGE_URL = 'https://betuanminh22032003.github.io/push-up/challenge.html';
export const APP_SCHEME = 'hitdat';
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.betuanminh.hitdat';
export const ANDROID_PACKAGE = 'com.betuanminh.hitdat';

export const CHALLENGE_DURATIONS = [30, 60, 120];
export const NAME_MAX = 24;
export const SCORE_MAX = 9999;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function utf8Bytes(text) {
  const escaped = encodeURIComponent(text);
  const bytes = [];
  for (let i = 0; i < escaped.length; i++) {
    if (escaped[i] === '%') {
      bytes.push(parseInt(escaped.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(escaped.charCodeAt(i));
    }
  }
  return bytes;
}

/** Throws on bytes that are not UTF-8. */
function utf8Text(bytes) {
  let escaped = '';
  for (const b of bytes) escaped += '%' + (b < 16 ? '0' : '') + b.toString(16);
  return decodeURIComponent(escaped);
}

export function base64UrlEncode(text) {
  const bytes = utf8Bytes(text);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += B64[n & 63];
  }
  return out;
}

/** Null when `body` is not base64url of UTF-8 text. */
export function base64UrlDecode(body) {
  if (typeof body !== 'string' || !/^[A-Za-z0-9_-]*$/.test(body) || body.length % 4 === 1) return null;
  const bytes = [];
  for (let i = 0; i < body.length; i += 4) {
    const chunk = body.slice(i, i + 4);
    let n = 0;
    for (let j = 0; j < 4; j++) n = (n << 6) | (j < chunk.length ? B64.indexOf(chunk[j]) : 0);
    bytes.push((n >> 16) & 255);
    if (chunk.length > 2) bytes.push((n >> 8) & 255);
    if (chunk.length > 3) bytes.push(n & 255);
  }
  try {
    return utf8Text(bytes);
  } catch {
    return null;
  }
}

/** FNV-1a, 32 bits, as 7 base-36 digits. A corruption check, not a signature. */
export function checksum(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(7, '0');
}

/** A display name as a link may carry it: no control characters, one line, short. */
export function cleanName(name) {
  const flat = String(name ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(flat).slice(0, NAME_MAX).join('').trim();
}

/** Six random base-36 characters; enough to tell a person's challenges apart. */
export function randomChallengeId(random = Math.random) {
  let id = '';
  for (let i = 0; i < 6; i++) id += Math.floor(random() * 36).toString(36);
  return id;
}

const ID_PATTERN = /^[a-z0-9]{4,12}$/;
const EXERCISE_PATTERN = /^[a-z]{2,24}$/;

/**
 * The challenge in a decoded payload, or null when a field is missing or out
 * of range. Which exercises exist is checked by the caller (./challenge.js),
 * so the web page can show a challenge for an exercise it has no name for.
 */
export function validatePayload(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  if (p.v !== CHALLENGE_VERSION) return null;
  if (typeof p.e !== 'string' || !EXERCISE_PATTERN.test(p.e)) return null;
  if (p.f !== 'reps' && p.f !== 'hold') return null;
  if (p.f === 'reps' ? !CHALLENGE_DURATIONS.includes(p.d) : p.d !== 0) return null;
  if (!Number.isInteger(p.s) || p.s < 0 || p.s > SCORE_MAX) return null;
  if (!Number.isInteger(p.t) || p.t < 0) return null;
  if (typeof p.i !== 'string' || !ID_PATTERN.test(p.i)) return null;
  if (p.n !== undefined && typeof p.n !== 'string') return null;
  if (p.r !== undefined && (typeof p.r !== 'string' || !ID_PATTERN.test(p.r))) return null;
  return {
    version: p.v,
    exerciseId: p.e,
    format: p.f,
    durationSeconds: p.d,
    name: cleanName(p.n),
    score: p.s,
    at: p.t * 1000,
    id: p.i,
    replyTo: p.r ?? null,
  };
}

/**
 * The token for a challenge.
 * @param {object} c  { exerciseId, format, durationSeconds, name, score, at (ms), id, replyTo? }
 */
export function encodeChallenge(c) {
  const payload = {
    v: CHALLENGE_VERSION,
    e: c.exerciseId,
    f: c.format,
    d: c.format === 'hold' ? 0 : c.durationSeconds,
    n: cleanName(c.name),
    s: Math.max(0, Math.min(SCORE_MAX, Math.round(c.score))),
    t: Math.floor(c.at / 1000),
    i: c.id,
  };
  if (c.replyTo) payload.r = c.replyTo;
  if (!validatePayload(payload)) throw new Error('Invalid challenge');
  const body = base64UrlEncode(JSON.stringify(payload));
  return `${body}.${checksum(body)}`;
}

/**
 * @returns {{ok: true, challenge: object} | {ok: false, error: 'empty'|'format'|'checksum'|'payload'}}
 */
export function decodeChallenge(token) {
  const text = typeof token === 'string' ? token.trim() : '';
  if (!text) return { ok: false, error: 'empty' };
  const match = /^([A-Za-z0-9_-]+)\.([0-9a-z]{7})$/.exec(text);
  if (!match) return { ok: false, error: 'format' };
  const [, body, sum] = match;
  if (checksum(body) !== sum) return { ok: false, error: 'checksum' };
  const json = base64UrlDecode(body);
  if (json === null) return { ok: false, error: 'payload' };
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'payload' };
  }
  const challenge = validatePayload(parsed);
  return challenge ? { ok: true, challenge } : { ok: false, error: 'payload' };
}

/** The https link, for sharing: opens the web page, which offers the app. */
export function challengeWebUrl(token) {
  return `${CHALLENGE_PAGE_URL}#${token}`;
}

/** The app's own deep link. */
export function challengeAppUrl(token) {
  return `${APP_SCHEME}://challenge?c=${token}`;
}

/**
 * Android's intent:// form of the deep link: opens the app when installed,
 * and the Play Store page otherwise (Chrome follows browser_fallback_url).
 */
export function challengeIntentUrl(token) {
  return (
    `intent://challenge?c=${token}#Intent;scheme=${APP_SCHEME};package=${ANDROID_PACKAGE};` +
    `S.browser_fallback_url=${encodeURIComponent(PLAY_STORE_URL)};end`
  );
}

/**
 * The token in any URL a challenge can arrive by: the deep link
 * (hitdat://challenge?c=...), the web page (challenge.html#...), or the web
 * build of the app (...#c=... or ?c=...). Null when there is none.
 */
export function extractChallengeToken(url) {
  if (typeof url !== 'string' || !url) return null;
  const param = /[?&#]c=([A-Za-z0-9_-]+\.[0-9a-z]+)/.exec(url);
  if (param) return param[1];
  const page = /challenge(?:\.html)?\/?#([A-Za-z0-9_-]+\.[0-9a-z]+)$/.exec(url);
  return page ? page[1] : null;
}
