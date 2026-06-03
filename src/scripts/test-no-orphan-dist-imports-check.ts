#!/usr/bin/env node
// @ts-nocheck
// Release gate: no test file may import a `dist/...` module whose TypeScript
// source no longer exists. This catches "test rot" left behind when a source
// module is deleted (e.g. the tmux runtime removed in the Zellij migration)
// but its test file is not — those tests fail with ERR_MODULE_NOT_FOUND and,
// because they live under test/unit + test/integration (which no release gate
// executes), the rot stays invisible. This gate makes it visible.
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.js';

const testDir = path.join(root, 'test');

// Match real ES import references to a dist module, NOT string-literal args:
//   import x from '../../core/foo.js'
//   import { y } from "../bar.js"
//   await import('../../baz.js')
// The leading `from`/`import(` requirement is what excludes assertion strings
// like `{ file: 'dist/index.js' }` from being treated as imports.
const IMPORT_RE = /(?:\bfrom\s*|\bimport\s*\(\s*)['"]([^'"]*\bdist\/[^'"]+\.js)['"]/g;

const orphans = [];
let scanned = 0;
let importEdges = 0;

for (const file of walk(testDir)) {
  if (!file.endsWith('.test.mjs')) continue;
  scanned += 1;
  const text = fs.readFileSync(file, 'utf8');
  const rel = path.relative(root, file);
  const seen = new Set();
  for (const match of text.matchAll(IMPORT_RE)) {
    const ref = normalizeDistRef(match[1]);
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    importEdges += 1;
    const srcPath = path.join(root, 'src', ref.replace(/^dist\//, '').replace(/\.js$/, '.ts'));
    const distPath = path.join(root, ref);
    // Pass if EITHER the TS source exists (module is real, just not built yet)
    // OR a built artifact exists. Only when both are missing is it an orphan.
    if (!fs.existsSync(srcPath) && !fs.existsSync(distPath)) {
      orphans.push({ test: rel, missing_import: ref, expected_source: path.relative(root, srcPath) });
    }
  }
}

assertGate(
  orphans.length === 0,
  'test files import deleted dist modules (orphan tests; delete them or restore the source)',
  { orphans }
);

emitGate('test:no-orphan-dist-imports', {
  schema: 'sks.test-no-orphan-dist-imports.v1',
  test_files_scanned: scanned,
  dist_import_edges: importEdges
});

function normalizeDistRef(raw) {
  const idx = raw.lastIndexOf('dist/');
  return idx >= 0 ? raw.slice(idx) : '';
}

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}
