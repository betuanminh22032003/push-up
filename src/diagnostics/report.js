/**
 * The text of a feedback or miscount report.
 *
 * Plain text, made to be read: the user sees exactly this in the share sheet
 * and picks where it goes (email, Zalo, a note...). The app sends nothing by
 * itself, so there is no hidden payload — what is on screen is all of it.
 * Field names are English for whoever reads the report; the opening line is
 * in the user's language.
 *
 * Pure, no imports: device and app details come in as arguments
 * (./device.js gathers them), so the Node suite runs this file as is.
 */

/** Errors a report carries; the log keeps more, but a share should stay short. */
export const REPORT_ERRORS = 5;

const iso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : '?');

/**
 * @param {object} input
 *   intro      first line, in the user's language
 *   app        { version, build? }
 *   device     { os, osVersion, model, brand? }
 *   miscount   optional { exerciseId, view, sourceId, counted, real, note, at, durationSeconds }
 *   errors     the local error log, newest first
 *   language   'vi' | 'en'
 *   now
 */
export function formatReport({ intro, app = {}, device = {}, miscount = null, errors = [], language, now = Date.now() }) {
  const lines = [];
  if (intro) lines.push(intro, '');
  lines.push(`App: Hít Đất AI ${app.version ?? '?'}${app.build ? ` (${app.build})` : ''}`);
  lines.push(
    `Device: ${[device.brand, device.model].filter(Boolean).join(' ') || '?'} · ${device.os ?? '?'} ${device.osVersion ?? ''}`.trim(),
  );
  if (language) lines.push(`Language: ${language}`);
  lines.push(`Time: ${iso(now)}`);

  if (miscount) {
    lines.push('', '--- Miscount ---');
    lines.push(`Exercise: ${miscount.exerciseId} (camera ${miscount.view ?? '?'} view)`);
    lines.push(`Source: ${miscount.sourceId ?? '?'}`);
    lines.push(`Counted: ${miscount.counted} · Real: ${miscount.real} · Off by: ${miscount.real - miscount.counted}`);
    if (Number.isFinite(miscount.durationSeconds)) lines.push(`Duration: ${miscount.durationSeconds}s`);
    lines.push(`Session: ${iso(miscount.at)}`);
    if (miscount.note) lines.push(`Note: ${miscount.note}`);
  }

  const recent = (Array.isArray(errors) ? errors : []).slice(0, REPORT_ERRORS);
  lines.push('', `--- Recent errors (${recent.length}) ---`);
  if (!recent.length) lines.push('none');
  for (const e of recent) {
    const tags = [e.source, e.fatal ? 'fatal' : null, e.count > 1 ? `x${e.count}` : null].filter(Boolean);
    lines.push(`${iso(e.at)} [${tags.join(', ')}] ${e.message}`);
    // The top of the stack places it; the rest is noise in a chat message.
    const top = String(e.stack || '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith(e.message))
      .slice(0, 3);
    for (const line of top) lines.push(`    ${line}`);
  }
  return lines.join('\n');
}

/** Bounds on what the miscount form accepts. */
export const MISCOUNT_MAX = 9999;
export const NOTE_MAX = 500;

/**
 * A miscount report from the form's text, or null when the count is not a
 * number the form should accept.
 * @param {object} input  { id, session: { exerciseId, sourceId, totalReps, durationSeconds, timestamp }, view, realText, note, now }
 */
export function buildMiscount({ id, session, view, realText, note, now = Date.now() }) {
  const trimmed = String(realText ?? '').trim();
  if (!/^\d{1,4}$/.test(trimmed)) return null;
  const real = Number(trimmed);
  if (real > MISCOUNT_MAX) return null;
  return {
    id,
    at: now,
    sessionAt: session.timestamp ?? null,
    exerciseId: session.exerciseId,
    sourceId: session.sourceId ?? null,
    view: view ?? null,
    counted: session.totalReps,
    real,
    durationSeconds: session.durationSeconds ?? null,
    note: String(note ?? '').trim().slice(0, NOTE_MAX),
  };
}
