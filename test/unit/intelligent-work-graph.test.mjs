import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('intelligent work graph computes ownership, critical path, and score', async () => {
  const mod = await import('../../dist/core/agents/intelligent-work-graph.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-work-graph-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'test'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/a.ts'), "import { helper } from './b';\nexport function makeA() { return helper(); }\n");
  fs.writeFileSync(path.join(root, 'src/b.ts'), "export function helper() { return 'ok'; }\n");
  fs.writeFileSync(path.join(root, 'test/a.test.mjs'), "import { makeA } from '../src/a';\n");
  const graph = mod.buildIntelligentWorkGraphFromData({
    inventory: { source_files: ['src/a.ts', 'src/b.ts'], tests: ['test/a.test.mjs'], docs: ['README.md'], scripts: ['dist/scripts/check.js'] },
    dependencyGraph: { edges: [{ from: 'src/a.ts', imports: ['src/b.ts'] }] },
    root,
    changedFiles: ['src/a.ts']
  });
  assert.equal(graph.schema, 'sks.intelligent-work-graph.v2');
  assert.ok(graph.file_to_symbols);
  assert.deepEqual(graph.exported_symbols['src/a.ts'], ['makeA']);
  assert.ok(graph.imported_symbols['test/a.test.mjs'].includes('makeA'));
  assert.equal(graph.ast_parser_limitations.includes('regex_only'), false);
  assert.ok(graph.critical_path.length >= 2);
  assert.ok(graph.work_graph_quality_score > 0);
});

test('repo inventory keeps representative roots ahead of large hidden caches', async (t) => {
  const { collectRepoInventory } = await import('../../dist/core/agents/work-partition/repo-inventory.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-repo-inventory-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = {
    'src/a.ts': 'export const a = 1;\n',
    'test/a.test.mjs': 'export {};\n',
    'docs/guide.md': '# guide\n',
    'schemas/a.schema.json': '{}\n',
    'scripts/tool.js': 'export {};\n',
    'crates/core/src/lib.rs': 'pub fn a() {}\n',
    'bin/tool.ts': 'export {};\n',
    '.domain/feature.ts': 'export const feature = true;\n',
    'package.json': '{"name":"fixture"}\n',
    'README.md': '# fixture\n'
  };
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }
  for (const cacheRoot of ['.claude/worktrees/cache', '.cache/generated']) {
    fs.mkdirSync(path.join(root, cacheRoot), { recursive: true });
    for (let index = 0; index < 50; index += 1) fs.writeFileSync(path.join(root, cacheRoot, `${String(index).padStart(3, '0')}.txt`), 'noise\n');
  }

  const first = await collectRepoInventory(root, { maxFiles: 10 });
  const second = await collectRepoInventory(root, { maxFiles: 10 });
  assert.deepEqual(first.files, second.files);
  assert.deepEqual(first.files.slice(0, 3), ['src/a.ts', 'test/a.test.mjs', 'docs/guide.md']);
  assert.ok(first.source_files.includes('src/a.ts'));
  assert.ok(first.tests.includes('test/a.test.mjs'));
  assert.ok(first.docs.includes('docs/guide.md'));
  assert.ok(first.files.includes('.domain/feature.ts'));
  assert.equal(first.files.some((file) => file.startsWith('.claude/') || file.startsWith('.cache/')), false);
});
