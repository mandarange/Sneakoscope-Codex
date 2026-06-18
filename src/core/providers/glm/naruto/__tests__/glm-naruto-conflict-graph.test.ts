import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConflictGraph, getNonConflictingSets, hasConflict } from '../glm-naruto-conflict-graph.js';
import type { PatchCandidateNode } from '../glm-naruto-types.js';
import { createPatchEnvelope } from '../glm-naruto-patch-envelope.js';

test('conflict graph detects same file conflict', () => {
  const nodes: PatchCandidateNode[] = [
    { patch_id: 'p1', shard_id: 's1', target_paths: ['src/a.ts'], score: 80, gate_passed: true, patch_sha256: 'aaa' },
    { patch_id: 'p2', shard_id: 's2', target_paths: ['src/a.ts'], score: 70, gate_passed: true, patch_sha256: 'bbb' }
  ];
  const graph = buildConflictGraph([], nodes);
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.edges[0]!.reason, 'same_file');
  assert.ok(hasConflict(graph, 'p1'));
});

test('conflict graph detects same hunk conflict within same shard', () => {
  const nodes: PatchCandidateNode[] = [
    { patch_id: 'p1', shard_id: 's1', target_paths: ['src/a.ts'], score: 80, gate_passed: true, patch_sha256: 'aaa' },
    { patch_id: 'p2', shard_id: 's1', target_paths: ['src/a.ts'], score: 70, gate_passed: true, patch_sha256: 'bbb' }
  ];
  const graph = buildConflictGraph([], nodes);
  assert.equal(graph.edges[0]!.reason, 'same_hunk');
});

test('getNonConflictingSets selects highest scoring non-conflicting patches', () => {
  const nodes: PatchCandidateNode[] = [
    { patch_id: 'p1', shard_id: 's1', target_paths: ['src/a.ts'], score: 80, gate_passed: true, patch_sha256: 'aaa' },
    { patch_id: 'p2', shard_id: 's2', target_paths: ['src/b.ts'], score: 70, gate_passed: true, patch_sha256: 'bbb' },
    { patch_id: 'p3', shard_id: 's3', target_paths: ['src/a.ts'], score: 60, gate_passed: true, patch_sha256: 'ccc' }
  ];
  const graph = buildConflictGraph([], nodes);
  const sets = getNonConflictingSets(graph);
  assert.ok(sets.length > 0);
  // p1 and p2 should be in the same set (non-conflicting)
  const firstSet = sets[0]!;
  assert.ok(firstSet.includes('p1'));
  assert.ok(firstSet.includes('p2'));
  assert.ok(!firstSet.includes('p3'));
});

test('same file non-overlapping hunks do not conflict when envelopes are available', () => {
  const leftPatch = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1 @@
-one
+ONE
`;
  const rightPatch = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -10 +10 @@
-ten
+TEN
`;
  const envelopes = [
    createPatchEnvelope({ missionId: 'M-test', workerId: 'p1', shardId: 's1', baseDigest: 'base', patch: leftPatch, strategy: 'minimal_patch', reasoningEffort: 'low', status: 'gate_passed' }),
    createPatchEnvelope({ missionId: 'M-test', workerId: 'p2', shardId: 's2', baseDigest: 'base', patch: rightPatch, strategy: 'minimal_patch', reasoningEffort: 'low', status: 'gate_passed' })
  ];
  const nodes: PatchCandidateNode[] = envelopes.map((env, idx) => ({ patch_id: env.worker_id, shard_id: env.shard_id, target_paths: env.target_paths, score: 80 - idx, gate_passed: true, patch_sha256: env.patch_sha256 }));
  const graph = buildConflictGraph(envelopes, nodes);
  assert.equal(graph.edges.length, 0);
});

test('same file overlapping hunks conflict when envelopes are available', () => {
  const leftPatch = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,2 @@
-one
+ONE
 two
`;
  const rightPatch = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -2,2 +2,2 @@
 two
-three
+THREE
`;
  const envelopes = [
    createPatchEnvelope({ missionId: 'M-test', workerId: 'p1', shardId: 's1', baseDigest: 'base', patch: leftPatch, strategy: 'minimal_patch', reasoningEffort: 'low', status: 'gate_passed' }),
    createPatchEnvelope({ missionId: 'M-test', workerId: 'p2', shardId: 's2', baseDigest: 'base', patch: rightPatch, strategy: 'minimal_patch', reasoningEffort: 'low', status: 'gate_passed' })
  ];
  const nodes: PatchCandidateNode[] = envelopes.map((env, idx) => ({ patch_id: env.worker_id, shard_id: env.shard_id, target_paths: env.target_paths, score: 80 - idx, gate_passed: true, patch_sha256: env.patch_sha256 }));
  const graph = buildConflictGraph(envelopes, nodes);
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.edges[0]!.reason, 'same_hunk');
});
