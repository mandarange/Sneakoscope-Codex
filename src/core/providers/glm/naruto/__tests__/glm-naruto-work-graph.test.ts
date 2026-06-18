import test from 'node:test';
import assert from 'node:assert/strict';
import { decomposeTask, validateWorkGraph } from '../glm-naruto-decomposer.js';

test('decomposeTask creates mutable shards for modification task', () => {
  const graph = decomposeTask({
    missionId: 'test-mission',
    task: 'fix src/foo.ts',
    mentionedPaths: ['src/foo.ts'],
    gitStatus: ''
  });
  assert.equal(graph.schema, 'sks.glm-naruto-work-graph.v1');
  assert.ok(graph.shards.length > 0);
  assert.ok(graph.mutable_shards.length > 0);
  assert.ok(graph.verification_shards.includes('shard-verify'));
});

test('validateWorkGraph rejects verify-only plan for modification task', () => {
  const graph = {
    schema: 'sks.glm-naruto-work-graph.v1' as const,
    mission_id: 'test',
    task: 'fix bug',
    shards: [{ id: 'shard-verify', kind: 'verification' as const, task: '', target_paths: [], forbidden_paths: [], base_digest: '', strategy: 'minimal_patch' as const, patches_per_shard: 0, max_tokens: 0, reasoning: 'none' as const, mutable: false }],
    dependencies: [],
    parallel_groups: [],
    mutable_shards: [],
    verification_shards: ['shard-verify']
  };
  const result = validateWorkGraph(graph, false);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'glm_naruto_invalid_verify_only_plan');
});

test('decomposeTask assigns diverse strategies across shards', () => {
  const graph = decomposeTask({
    missionId: 'test',
    task: 'fix multiple files',
    mentionedPaths: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
    gitStatus: ''
  });
  const strategies = new Set(graph.shards.filter(s => s.mutable).map(s => s.strategy));
  assert.ok(strategies.size >= 2, 'should have at least 2 different strategies');
});
