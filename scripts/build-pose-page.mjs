/**
 * Generate docs/pose.html — the standalone pose detector loaded by the app's
 * WebView in Expo Go.
 *
 *   npm run build:pose
 *
 * The page cannot `import` the app's modules (it is one file served from
 * GitHub Pages, and the sources use Metro-style extensionless imports), but
 * duplicating the counting rules into it would guarantee the two drift apart.
 * So the modules are inlined verbatim: imports and `export` keywords stripped,
 * concatenated in dependency order, and pasted into the template.
 *
 * The result is one source of truth — the same src/pose/ modules that
 * scripts/verify-pose.mjs asserts against.
 *
 * They all land in one classic-script scope, together with the page's own
 * code, so no two of them may declare the same top-level name: on the phone
 * that is a SyntaxError and a page that never starts. The build checks for
 * exactly that, and parses the finished script, before writing anything.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { read, root } from './load.mjs';

const MARKER = '/* __POSE_CORE__ */';

/** Dependency order: each module uses only names declared above it. */
const MODULES = [
  'geometry',
  'landmarks',
  'repEngine',
  'pushupAnalyzer',
  'squatAnalyzer',
  'situpAnalyzer',
  'jumpingJackAnalyzer',
  'analyzers',
];

/** Strip module syntax so the source can live inside a classic <script>. */
function toClassicScript(source) {
  return source
    .replace(/^import[\s\S]*?from\s+'[^']+';\s*$/gm, '')
    .replace(/^export\s+(const|function|class|let|var)\b/gm, '$1')
    .replace(/^export\s*\{[^}]*\};?\s*$/gm, '');
}

/** Names declared at the top level of a script, in order, repeats included. */
function topLevelNames(source) {
  return [...source.matchAll(/^(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/gm)].map(
    (m) => m[1],
  );
}

const core = MODULES.map((name) => toClassicScript(read(`src/pose/${name}.js`))).join('\n');

const template = read('src/pose/web/pose.template.html');
if (!template.includes(MARKER)) {
  console.error(`Template is missing the ${MARKER} marker.`);
  process.exit(1);
}

// A function replacement, so a `$` in the sources is never read as a pattern.
// Line endings are whatever the checkout has (git turns LF into CRLF on
// Windows), so the page is always written with LF and compared as content.
const html = template.replace(MARKER, () => core).replace(/\r\n/g, '\n');

// Sanity-check the generated page before writing it: a silently broken build
// would only surface on a phone, which is the worst place to debug it.
const problems = [];
if (/\bexport\s/.test(core)) problems.push('an `export` survived the strip');
if (/^import\s/m.test(core)) problems.push('an `import` survived the strip');

const declared = new Set(topLevelNames(core));
for (const symbol of [
  'createAnalyzer',
  'poseExerciseId',
  'POSE_EXERCISE_IDS',
  'POSE_DEFAULTS',
  'ISSUES',
  'fromMediaPipe',
  'SKELETON_BONES',
]) {
  if (!declared.has(symbol)) problems.push(`missing ${symbol}`);
}

const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (scripts.length !== 1) problems.push(`expected one inline <script>, found ${scripts.length}`);
for (const script of scripts) {
  const seen = new Set();
  for (const name of topLevelNames(script)) {
    if (seen.has(name)) problems.push(`\`${name}\` is declared twice at the top level`);
    seen.add(name);
  }
  try {
    // Compiles without running it: the same parse the browser does first.
    new vm.Script(script, { filename: 'pose.html <script>' });
  } catch (e) {
    problems.push(`the page script does not parse: ${e.message}`);
  }
}

if (problems.length) {
  console.error('Refusing to write a broken page:\n  - ' + problems.join('\n  - '));
  process.exit(1);
}

const outDir = path.join(root, 'docs');
const outFile = path.join(outDir, 'pose.html');
const relative = path.relative(root, outFile);

// `--check` guards against the published page drifting from src/pose/. Editing
// a module and forgetting to rebuild would leave phones running stale counting
// rules while the tests pass against the new ones.
if (process.argv.includes('--check')) {
  let current = null;
  try {
    current = readFileSync(outFile, 'utf8');
  } catch {
    console.error(`${relative} is missing. Run: npm run build:pose`);
    process.exit(1);
  }
  if (current.replace(/\r\n/g, '\n') !== html) {
    console.error(`${relative} is stale — src/pose/ has changed. Run: npm run build:pose`);
    process.exit(1);
  }
  console.log(`  ok    ${relative} is up to date with src/pose/`);
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, html);

console.log(`Wrote ${relative} (${Math.round(html.length / 1024)}KB)`);
console.log('Detection core inlined from src/pose/ — edit those modules, not the page.');
