/**
 * Generate docs/challenge.html — the page a challenge link opens, served by
 * GitHub Pages next to pose.html and privacy.html.
 *
 *   npm run build:challenge
 *
 * Like the pose page, it does not get its own copy of the rules: the link
 * codec (src/challenge/codec.js) is inlined verbatim, and the exercises'
 * names and icons come from the app's tables, so a link the app writes is
 * one the page reads. `--check` (run by `npm run verify`) fails when the
 * published page has drifted from the sources.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { bundle, read, root, stripImport } from './load.mjs';

const MARKER = '/* __CHALLENGE_CORE__ */';

const exercises = await bundle(read('src/exercises/exercises.js'));
const strings = await bundle(
  read('src/i18n/exerciseStrings.js'),
  read('src/i18n/featureStrings.js'),
  stripImport(stripImport(read('src/i18n/strings.js'), './exerciseStrings'), './featureStrings'),
);

const names = Object.fromEntries(
  exercises.EXERCISES.map((e) => [
    e.id,
    { icon: e.icon, en: strings.STRINGS.en[`exercise.${e.id}`], vi: strings.STRINGS.vi[`exercise.${e.id}`] },
  ]),
);

const codec = read('src/challenge/codec.js').replace(/^export\s+(const|function)\b/gm, '$1');
const core = `${codec}\nconst EXERCISE_NAMES = ${JSON.stringify(names, null, 1)};\n`;

const template = read('src/challenge/web/challenge.template.html');
if (!template.includes(MARKER)) {
  console.error(`Template is missing the ${MARKER} marker.`);
  process.exit(1);
}
const html = template.replace(MARKER, () => core).replace(/\r\n/g, '\n');

const problems = [];
if (/^\s*(export|import)\s/m.test(core)) problems.push('module syntax survived the strip');
for (const script of [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])) {
  try {
    new vm.Script(script, { filename: 'challenge.html <script>' });
  } catch (e) {
    problems.push(`the page script does not parse: ${e.message}`);
  }
}
if (problems.length) {
  console.error('Refusing to write a broken page:\n  - ' + problems.join('\n  - '));
  process.exit(1);
}

const outFile = path.join(root, 'docs', 'challenge.html');
const relative = path.relative(root, outFile);

if (process.argv.includes('--check')) {
  let current = null;
  try {
    current = readFileSync(outFile, 'utf8');
  } catch {
    console.error(`${relative} is missing. Run: npm run build:challenge`);
    process.exit(1);
  }
  if (current.replace(/\r\n/g, '\n') !== html) {
    console.error(`${relative} is stale. Run: npm run build:challenge`);
    process.exit(1);
  }
  console.log(`  ok    ${relative} is up to date with src/challenge/`);
  process.exit(0);
}

writeFileSync(outFile, html);
console.log(`Wrote ${relative} (${Math.round(html.length / 1024)}KB)`);
