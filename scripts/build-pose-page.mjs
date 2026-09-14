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
 * The result is one source of truth — the same geometry.js, landmarks.js and
 * pushupAnalyzer.js that scripts/verify-pose.mjs asserts against.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { read, root } from './load.mjs';

const MARKER = '/* __POSE_CORE__ */';

/** Strip module syntax so the source can live inside a classic <script>. */
function toClassicScript(source) {
  return source
    .replace(/^import[\s\S]*?from\s+'[^']+';\s*$/gm, '')
    .replace(/^export\s+(const|function|class|let|var)\b/gm, '$1')
    .replace(/^export\s*\{[^}]*\};?\s*$/gm, '');
}

const core = [
  read('src/pose/geometry.js'),
  read('src/pose/landmarks.js'),
  read('src/pose/pushupAnalyzer.js'),
]
  .map(toClassicScript)
  .join('\n');

const template = read('src/pose/web/pose.template.html');
if (!template.includes(MARKER)) {
  console.error(`Template is missing the ${MARKER} marker.`);
  process.exit(1);
}

const html = template.replace(MARKER, core);

// Sanity-check the generated page before writing it: a silently broken build
// would only surface on a phone, which is the worst place to debug it.
const problems = [];
if (/\bexport\s/.test(core)) problems.push('an `export` survived the strip');
if (/^import\s/m.test(core)) problems.push('an `import` survived the strip');
for (const symbol of ['createPushupAnalyzer', 'fromMediaPipe', 'SKELETON_BONES', 'ISSUES']) {
  if (!core.includes(symbol)) problems.push(`missing ${symbol}`);
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
  if (current !== html) {
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
