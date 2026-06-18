import test from 'node:test';
import assert from 'node:assert/strict';
import { planMerge, scoreCandidate } from '../glm-naruto-merge-planner.js';
import type { GlmNarutoConflictGraph, PatchCandidateNode } from '../glm-naruto-types.js';

test('planMerge selects highest scoring non-conflicting set deterministically', () => {
  const nodes: PatchCandidateNode[] = [
    { patch_id: 'p1', shard_id: 's1', target_paths: ['src/a.ts'], score: 90, gate_passed: true, patch_sha256: 'aaa' },
    { patch_id: 'p2', shard_id: 's2', target_paths: ['src/b.ts'], score: 80, gate_passed: true, patch_sha256: 'bbb' }
  ];
  const graph: GlmNarutoConflictGraph = {
    schema: 'sks.glm-naruto-conflict-graph.v1',
    nodes,
    edges: []
  };
  const plan = planMerge({ missionId: 'test', graph, strategy: 'deterministic' });
  assert.equal(plan.schema, 'sks.glm-naruto-merge-plan.v1');
  assert.ok(plan.selected_patches.includes('p1'));
  assert.ok(plan.selected_patches.includes('p2'));
});

test('scoreCandidate penalizes protected paths', () => {
  const node: PatchCandidateNode = {
    patch_id: 'p1', shard_id: 's1', target_paths: ['src/a.ts'], score: 0, gate_passed: true, patch_sha256: 'aaa'
  };
  const clean = scoreCandidate({ node, patchSize: 100, touchedPathsCount: 1, protectedPath: false, testFailure: false });
  const dirty = scoreCandidate({ node, patchSize: 100, touchedPathsCount: 1, protectedPath: true, testFailure: false });
  assert.ok(clean > dirty, 'protected path should lower score');
});
