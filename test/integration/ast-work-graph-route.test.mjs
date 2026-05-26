import test from 'node:test';
import assert from 'node:assert/strict';

test('AST-aware work graph influences task graph work items', async () => {
  const graphMod = await import('../../dist/core/agents/intelligent-work-graph.js');
  const graph = graphMod.buildIntelligentWorkGraphFromData({
    root: process.cwd(),
    inventory: {
      root: process.cwd(),
      source_files: ['src/core/commands/agent-command.ts', 'src/core/agents/agent-cleanup-executor.ts'],
      tests: ['test/unit/agent-cleanup-executor-v2.test.mjs'],
      docs: ['docs/agent-cleanup-executor.md'],
      scripts: ['scripts/agent-cleanup-executor-v2-check.mjs']
    },
    dependencyGraph: { edges: [{ from: 'src/core/commands/agent-command.ts', imports: ['src/core/agents/agent-cleanup-executor.ts'] }] },
    changedFiles: ['src/core/agents/agent-cleanup-executor.ts'],
    route: '$Team',
    prompt: 'cleanup executor'
  });
  const taskGraph = {
    work_items: [
      { work_item_id: 'work-001', target_paths: ['src/core/agents/agent-cleanup-executor.ts'], priority: 9, dependencies: [], lease_requirements: [] }
    ]
  };
  const enhanced = graphMod.enhanceTaskGraphWithIntelligence(taskGraph, graph);
  assert.equal(enhanced.work_graph_quality_score, graph.work_graph_quality_score);
  assert.equal(enhanced.work_items[0].intelligent_work_graph_ref, 'agent-intelligent-work-graph.json');
});
