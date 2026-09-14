/**
 * Loads the app's modules into plain Node.
 *
 * The source is written for Metro — extensionless relative imports, a native
 * AsyncStorage — neither of which Node resolves. Rather than alter the app to
 * suit the tests, each module is read as text and its imports rewritten on the
 * way in, so what runs under test is the real implementation.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

export const asModule = (source) =>
  import('data:text/javascript,' + encodeURIComponent(source));

/** Drop a relative import line; its exports are supplied by concatenation. */
export const stripImport = (source, spec) =>
  source.replace(new RegExp(`^import .* from '${spec}';$`, 'm'), '');

/**
 * Concatenate a module with its local dependencies into one unit. Node then
 * needs no resolution at all, and the modules stay untouched on disk.
 */
export const bundle = (...sources) => asModule(sources.join('\n'));

/** In-memory stand-in for AsyncStorage with the same contract. */
export const MEMORY_ASYNC_STORAGE =
  'const _m = new Map();\n' +
  'const AsyncStorage = {\n' +
  '  getItem: async (k) => (_m.has(k) ? _m.get(k) : null),\n' +
  '  setItem: async (k, v) => { _m.set(k, String(v)); },\n' +
  '  removeItem: async (k) => { _m.delete(k); },\n' +
  '};\n' +
  'export const __mem = _m;';

/** Minimal assertion harness shared by the suites. */
export function createHarness() {
  const state = { passed: 0, failed: 0 };
  return {
    state,
    group: (name) => console.log('\n' + name),
    check: async (name, fn) => {
      try {
        await fn();
        state.passed += 1;
        console.log('  ok    ' + name);
      } catch (error) {
        state.failed += 1;
        console.log('  FAIL  ' + name + '\n        ' + error.message.split('\n')[0]);
      }
    },
  };
}
