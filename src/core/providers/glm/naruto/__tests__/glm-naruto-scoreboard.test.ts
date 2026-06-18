import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGlmNarutoCandidateScoreboard } from '../glm-naruto-scoreboard.js';
import { createPatchEnvelope } from '../glm-naruto-patch-envelope.js';
import { planMerge } from '../glm-naruto-merge-planner.js';
import type { GlmNarutoConflictGraph, GlmNarutoWorkerTrace, PatchCandidateNode } from '../glm-naruto-types.js';

function patch(path = 'src/a.ts', value = 2) {
  return `diff --git a/${path} b/${path}
--- a/${path}
+++ b/${path}
@@ -1 +1 @@
-export const a = 1;
+export const a = ${value};
`;
}

function node(id: string, score = 1): PatchCandidateNode {
  return { patch_id: id, shard_id: id, target_paths: ['src/a.ts'], score, gate_passed: true, patch_sha256: id };
}

function trace(workerId: string, risk: number, confidence: number, ttft = 100): GlmNarutoWorkerTrace {
  return {
    worker_id: workerId,
    shard_id: workerId,
    strategy: 'minimal_patch',
    model: 'z-ai/glm-5.2',
    provider: 'openrouter',
    session_id: `s-${workerId}`,
    ttft_ms: ttft,
    total_ms: ttft + 10,
    request_cache_hit: false,
    output_digest: 'out',
    patch_digest: workerId,
    status: 'verification_passed',
    verifier_risk_score: risk,
    verifier_confidence: confidence
  };
}

test('scoreboard disqualifies verifier failure and secret leaks', () => {
  const ok = createPatchEnvelope({ missionId: 'M', workerId: 'ok', shardId: 'ok', baseDigest: 'b', patch: patch(), strategy: 'minimal_patch', reasoningEffort: 'low', status: 'gate_passed' });
  const failed = { ...ok, worker_id: 'failed', shard_id: 'failed', status: 'verification_failed' as const, verification_passed: false };
  const secret = createPatchEnvelope({ missionId: 'M', workerId: 'secret', shardId: 'secret', baseDigest: 'b', patch: `${patch()}+const key = "sk-or-12345678901234567890";\n`, strategy: 'minimal_patch', reasoningEffort: 'low', status: 'gate_passed' });
  const graph: GlmNarutoConflictGraph = { schema: 'sks.glm-naruto-conflict-graph.v1', nodes: [node('ok'), node('failed'), node('secret')], edges: [] };
  const board = buildGlmNarutoCandidateScoreboard({ missionId: 'M', envelopes: [ok, failed, secret], traces: [trace('ok', 0, 1)], graph, requestedPaths: ['src/a.ts'] });
  assert.equal(board.scores.find((score) => score.patch_id === 'failed')?.disqualified, true);
  assert.equal(board.scores.find((score) => score.patch_id === 'secret')?.disqualification_reasons.includes('secret_leak'), true);
});

test('merge planner uses scoreboard order over node length score', () => {
  const graph: GlmNarutoConflictGraph = {
    schema: 'sks.glm-naruto-conflict-graph.v1',
    nodes: [node('low', 999), node('high', 1)],
    edges: [{ left_patch_id: 'low', right_patch_id: 'high', reason: 'same_hunk' }]
  };
  const scoreboard = {
    schema: 'sks.glm-naruto-candidate-scoreboard.v1' as const,
    mission_id: 'M',
    scores: [
      { schema: 'sks.glm-naruto-candidate-score.v1' as const, patch_id: 'low', shard_id: 'low', total_score: 1, components: emptyComponents(), disqualified: false, disqualification_reasons: [] },
      { schema: 'sks.glm-naruto-candidate-score.v1' as const, patch_id: 'high', shard_id: 'high', total_score: 500, components: emptyComponents(), disqualified: false, disqualification_reasons: [] }
    ]
  };
  const plan = planMerge({ missionId: 'M', graph, scoreboard, strategy: 'deterministic' });
  assert.deepEqual(plan.candidates[0]?.patch_ids, ['high']);
});

function emptyComponents() {
  return {
    deterministic_gate: 0,
    verifier: 0,
    verifier_confidence: 0,
    verifier_risk_penalty: 0,
    patch_size_penalty: 0,
    touched_path_penalty: 0,
    target_alignment: 0,
    hunk_conflict_penalty: 0,
    latency_penalty: 0,
    cache_bonus: 0,
    strategy_diversity_bonus: 0,
    secret_safety: 0
  };
}
