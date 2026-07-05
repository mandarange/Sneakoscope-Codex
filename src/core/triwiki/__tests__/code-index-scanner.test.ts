import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scanCodebaseIndex } from '../code-index-scanner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function makeFixtureRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-code-index-scanner-'));
  fs.mkdirSync(path.join(root, 'src', 'a'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src', 'b'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src', 'a', 'index.ts'),
    ['export const CONST_A = 1;', 'export function helperA() {', '  return CONST_A;', '}', ''].join('\n')
  );
  fs.writeFileSync(
    path.join(root, 'src', 'b', 'index.ts'),
    ["import { helperA } from '../a';", '', 'export function useHelperA() {', '  return helperA();', '}', ''].join('\n')
  );
  return root;
}

test('scanCodebaseIndex detects module boundaries and cross-module dependency edges on a fixture repo', async () => {
  const root = makeFixtureRoot();
  const index = await scanCodebaseIndex(root);
  assert.equal(index.schema, 'sks.code-index.v1');
  assert.equal(index.truncated, false);
  assert.equal(index.modules.length, 2);

  const moduleA = index.modules.find((m) => m.paths.includes('src/a'));
  const moduleB = index.modules.find((m) => m.paths.includes('src/b'));
  assert.ok(moduleA, 'expected a module for src/a');
  assert.ok(moduleB, 'expected a module for src/b');
  assert.notEqual(moduleA!.module_id, moduleB!.module_id);

  assert.ok(moduleB!.dependency_edges.includes(moduleA!.module_id), 'module b should depend on module a');
  assert.ok(moduleA!.file_count > 0);
  assert.ok(moduleB!.file_count > 0);
  assert.ok(moduleA!.loc > 0);
  assert.ok(moduleB!.loc > 0);
  assert.ok(moduleA!.entry_points.some((entry) => entry.endsWith('index.ts')));
  assert.ok(moduleA!.exports_summary.length > 0);
});

test('scanCodebaseIndex runs against the real SKS repo without throwing and finds many modules', async () => {
  const repoRoot = path.join(__dirname, '..', '..', '..', '..');
  assert.ok(fs.existsSync(path.join(repoRoot, 'package.json')), 'resolved repo root must contain package.json');
  const index = await scanCodebaseIndex(repoRoot);
  assert.equal(index.schema, 'sks.code-index.v1');
  assert.ok(index.modules.length >= 10, `expected at least 10 modules, got ${index.modules.length}`);
  for (const card of index.modules) {
    assert.ok(card.file_count > 0);
    assert.ok(card.loc >= 0);
    assert.ok(['low', 'medium', 'high'].includes(card.risk));
  }
});
