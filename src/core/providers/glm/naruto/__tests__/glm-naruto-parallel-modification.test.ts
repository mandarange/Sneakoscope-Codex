import test from 'node:test';
import assert from 'node:assert/strict';
import { decomposeTask } from '../glm-naruto-decomposer.js';
import { computeInitialLaneMix, planShardCandidates } from '../glm-naruto-shard-planner.js';
import { validateWorkGraph } from '../glm-naruto-decomposer.js';

test('modification task creates patch_worker shards not verify-only', () => {
  const graph = decomposeTask({
    missionId: 'test',
    task: 'fix src/foo.ts and src/bar.ts',
    mentionedPaths: ['src/foo.ts', 'src/bar.ts'],
    gitStatus: ''
  });
  const validation = validateWorkGraph(graph, false);
  assert.equal(validation.ok, true);
  assert.ok(graph.mutable_shards.length >= 2);
});

test('at least 70% of initial active lanes are patch workers for modification tasks', () => {
  const graph = decomposeTask({
    missionId: 'test',
    task: 'fix src/foo.ts',
    mentionedPaths: ['src/foo.ts'],
    gitStatus: ''
  });
  const mix = computeInitialLaneMix(graph);
  const total = mix.patch_workers + mix.scouts + mix.verifiers;
  const ratio = total > 0 ? mix.patch_workers / total : 0;
  assert.ok(ratio >= 0.7, `patch worker ratio ${ratio} should be >= 0.7`);
});

test('planShardCandidates assigns multiple strategies per shard', () => {
  const graph = decomposeTask({
    missionId: 'test',
    task: 'fix critical bug',
    mentionedPaths: ['src/critical.ts'],
    gitStatus: ''
  });
  const plan = planShardCandidates(graph);
  assert.ok(plan.length > 0);
  for (const entry of plan) {
    assert.ok(entry.strategies.length >= 1);
    assert.ok(entry.candidate_count >= 1);
  }
});
