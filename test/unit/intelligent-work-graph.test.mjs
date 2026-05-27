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
    inventory: { source_files: ['src/a.ts', 'src/b.ts'], tests: ['test/a.test.mjs'], docs: ['README.md'], scripts: ['scripts/check.mjs'] },
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
