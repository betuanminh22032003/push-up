/**
 * Generate the short cue sounds in assets/ as 16-bit mono WAV.
 *
 *   node scripts/make-sounds.mjs
 *
 * Pure tones with a short fade so they never click. Kept as a script rather
 * than as opaque binaries: change a frequency here, rerun, and the asset is
 * reproducible instead of being a file nobody can regenerate.
 *
 *   tick.wav   one countdown second           (short, mid)
 *   go.wav     countdown finished, set starts (longer, higher)
 *   done.wav   set target reached / workout saved (two rising notes)
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const RATE = 44100;

/** @param {{freq:number, ms:number, gain?:number}[]} notes */
function tone(notes) {
  const total = notes.reduce((n, note) => n + Math.round((RATE * note.ms) / 1000), 0);
  const samples = new Int16Array(total);
  let offset = 0;
  for (const { freq, ms, gain = 0.5 } of notes) {
    const count = Math.round((RATE * ms) / 1000);
    const fade = Math.min(Math.round(RATE * 0.006), count / 2);
    for (let i = 0; i < count; i += 1) {
      const env = Math.min(1, i / fade, (count - i) / fade);
      const v = Math.sin((2 * Math.PI * freq * i) / RATE) * gain * env;
      samples[offset + i] = Math.round(v * 32767);
    }
    offset += count;
  }
  return samples;
}

function wav(samples) {
  const data = Buffer.from(samples.buffer);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const sounds = {
  'tick.wav': tone([{ freq: 880, ms: 70 }]),
  'go.wav': tone([{ freq: 1320, ms: 220, gain: 0.55 }]),
  'done.wav': tone([
    { freq: 880, ms: 110 },
    { freq: 0, ms: 30, gain: 0 },
    { freq: 1320, ms: 200, gain: 0.55 },
  ]),
};

for (const [name, samples] of Object.entries(sounds)) {
  const file = path.join(root, 'assets', name);
  writeFileSync(file, wav(samples));
  console.log(`wrote ${path.relative(root, file)} (${samples.length} samples)`);
}
