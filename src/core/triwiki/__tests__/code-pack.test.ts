import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import type { CodeIndex } from '../code-index-scanner.js';
import { buildCodePack, validateCodePack, writeCodePackAtomic, codePackPath, codePackPrevPath } from '../code-pack.js';

function makeFixtureRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-code-pack-'));
  fs.mkdirSync(path.join(root, 'src', 'a'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'a', 'index.ts'), ['export const CONST_A = 1;', ''].join('\n'));
  return root;
}

function makeFixtureIndex(root: string): CodeIndex {
  return {
    schema: 'sks.code-index.v1',
    generated_at: new Date().toISOString(),
    root,
    truncated: false,
    scanned_file_count: 1,
    scanned_files_cap: 4000,
    modules: [
      {
        module_id: 'a',
        paths: ['src/a'],
        entry_points: ['src/a/index.ts'],
        exports_summary: ['export const CONST_A = 1;'],
        dependency_edges: [],
        file_count: 1,
        loc: 2,
        risk: 'low'
      }
    ]
  };
}

test('buildCodePack produces entries with non-empty citations from a fixture index', () => {
  const root = makeFixtureRoot();
  const index = makeFixtureIndex(root);
  const pack = buildCodePack(root, index);
  assert.equal(pack.schema, 'sks.code-pack.v1');
  assert.equal(pack.entries.length, 1);
  const entry = pack.entries[0]!;
  assert.equal(entry.id, 'code:a');
  assert.ok(entry.citations.length > 0, 'entry should have at least one citation');
  assert.ok(entry.citations.some((c) => c.path === 'src/a' || c.path === 'src/a/index.ts'));
  assert.ok(entry.text.length > 0);
  assert.ok(entry.token_cost > 0);
  assert.equal(pack.total_token_cost, entry.token_cost);
});

test('buildCodePack skips modules with zero paths and zero entry points', () => {
  const root = makeFixtureRoot();
  const index = makeFixtureIndex(root);
  index.modules.push({
    module_id: 'uncited',
    paths: [],
    entry_points: [],
    exports_summary: ['export const X = 1;'],
    dependency_edges: [],
    file_count: 1,
    loc: 1,
    risk: 'low'
  });
  const pack = buildCodePack(root, index);
  assert.equal(pack.entries.length, 1, 'uncited module must be skipped entirely');
  assert.ok(!pack.entries.some((e) => e.id === 'code:uncited'));
});

test('validateCodePack fails with a specific issue when a citation path does not exist on disk', async () => {
  const root = makeFixtureRoot();
  const index = makeFixtureIndex(root);
  const pack = buildCodePack(root, index);
  pack.entries[0]!.citations.push({ path: 'src/nope.ts' });
  const result = await validateCodePack(pack, root);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.includes('src/nope.ts')), `expected issue mentioning missing path, got: ${JSON.stringify(result.issues)}`);
});

test('validateCodePack passes for a well-formed pack', async () => {
  const root = makeFixtureRoot();
  const index = makeFixtureIndex(root);
  const pack = buildCodePack(root, index);
  const result = await validateCodePack(pack, root);
  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
});

test('validateCodePack reports entries with no citations and token budget overruns', async () => {
  const root = makeFixtureRoot();
  const index = makeFixtureIndex(root);
  const pack = buildCodePack(root, index);
  pack.entries.push({
    id: 'code:phantom',
    text: 'phantom module with no citations',
    citations: [],
    trust_score: 0.5,
    freshness: 'unknown',
    token_cost: 100000
  });
  pack.total_token_cost = pack.entries.reduce((sum, e) => sum + e.token_cost, 0);
  const result = await validateCodePack(pack, root);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.includes('code:phantom has no citations')));
  assert.ok(result.issues.some((issue) => issue.includes('exceeds token_budget')));
});

test('writeCodePackAtomic preserves the previous pack as code-pack.prev.json on second write', async () => {
  const root = makeFixtureRoot();
  const index = makeFixtureIndex(root);
  const firstPack = buildCodePack(root, index);
  const firstResult = await writeCodePackAtomic(root, firstPack);
  assert.equal(firstResult.ok, true);
  assert.equal(firstResult.prev_path, null, 'no previous pack should exist on first write');

  index.modules[0]!.exports_summary.push('export function extra() {}');
  const secondPack = buildCodePack(root, index);
  const secondResult = await writeCodePackAtomic(root, secondPack);
  assert.equal(secondResult.ok, true);
  assert.equal(secondResult.prev_path, codePackPrevPath(root));

  const currentOnDisk = JSON.parse(fs.readFileSync(codePackPath(root), 'utf8'));
  const prevOnDisk = JSON.parse(fs.readFileSync(codePackPrevPath(root), 'utf8'));
  assert.deepEqual(currentOnDisk, secondPack);
  assert.deepEqual(prevOnDisk, firstPack);
  assert.notDeepEqual(currentOnDisk, prevOnDisk);
});
