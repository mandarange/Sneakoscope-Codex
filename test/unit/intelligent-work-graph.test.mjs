import test from 'node:test';
import assert from 'node:assert/strict';

test('intelligent work graph computes ownership, critical path, and score', async () => {
  const mod = await import('../../dist/core/agents/intelligent-work-graph.js');
  const graph = mod.buildIntelligentWorkGraphFromData({
    inventory: { source_files: ['src/a.ts', 'src/b.ts'], tests: ['test/a.test.mjs'], docs: ['README.md'], scripts: ['scripts/check.mjs'] },
    dependencyGraph: { edges: [{ from: 'src/a.ts', imports: ['src/b.ts'] }] },
    changedFiles: ['src/a.ts']
  });
  assert.equal(graph.schema, 'sks.intelligent-work-graph.v1');
  assert.ok(graph.critical_path.length >= 2);
  assert.ok(graph.work_graph_quality_score > 0);
});
