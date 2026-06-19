import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import { writeGlmNarutoFinalSeal } from '../glm-naruto-final-seal.js';
import type { GlmNarutoMissionResult } from '../glm-naruto-types.js';

function missionResult(ok = true): GlmNarutoMissionResult {
  return {
    schema: 'sks.glm-naruto-mission-result.v1',
    ok,
    status: ok ? 'completed' : 'blocked',
    mission_id: 'M-test',
    task: 'task',
    model: 'z-ai/glm-5.2',
    gpt_fallback_allowed: false,
    termination_reason: ok ? 'completed_merge_applied' : 'blocked',
    workers_started: 1,
    workers_completed: 1,
    patch_candidates: 1,
    gate_passed_candidates: 1,
    mergeable_candidates: 1,
    applied_patches: ok ? 1 : 0,
    failed_shards: 0,
    repair_waves: 0,
    budget_used_ms: 1,
    blockers: [],
    warnings: []
  };
}

test('final seal passes when route invariants are satisfied', async () => {
  const artifactDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-final-seal-'));
  const result = await writeGlmNarutoFinalSeal({
    artifactDir,
    missionId: 'M-test',
    result: missionResult(true),
    envelopes: [],
    traces: [],
    isolationPolicy: { schema: 'sks.glm-naruto-isolation-policy.v1', requested: 'patch-envelope-only', selected: 'patch-envelope-only', honest: true, reason: 'test', blockers: [], fallback_allowed: false, workers_write_main_workspace: false },
    scheduler: { max_observed_active_workers: 1, queue_drained: true, backpressure_events: 0 },
    selectedPatchIds: ['w1'],
    applyTransaction: null,
    secretAudit: { ok: true, findings: [] },
    stopGatePath: path.join(artifactDir, 'stop-gate.json'),
    stopGatePassed: true
  });
  assert.equal(result.passed, true);
  assert.equal(result.seal.status, 'passed');
});

test('final seal blocks on model mismatch evidence', async () => {
  const artifactDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-final-seal-'));
  const result = await writeGlmNarutoFinalSeal({
    artifactDir,
    missionId: 'M-test',
    result: missionResult(true),
    envelopes: [{ model: 'wrong-model', worker_id: 'w1', gpt_fallback_allowed: false } as any],
    traces: [],
    isolationPolicy: { schema: 'sks.glm-naruto-isolation-policy.v1', requested: 'patch-envelope-only', selected: 'patch-envelope-only', honest: true, reason: 'test', blockers: [], fallback_allowed: false, workers_write_main_workspace: false },
    scheduler: { max_observed_active_workers: 1, queue_drained: true, backpressure_events: 0 },
    selectedPatchIds: ['w1'],
    applyTransaction: null,
    secretAudit: { ok: true, findings: [] },
    stopGatePath: path.join(artifactDir, 'stop-gate.json'),
    stopGatePassed: false
  });
  assert.equal(result.passed, false);
  assert.equal(result.seal.status, 'blocked');
  assert.deepEqual(result.seal.model_lock.mismatches, ['envelope:w1']);
});

test('final seal blocks when required requirement coverage is missing', async () => {
  const artifactDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-final-seal-'));
  const result = await writeGlmNarutoFinalSeal({
    artifactDir,
    missionId: 'M-test',
    result: missionResult(true),
    envelopes: [],
    traces: [],
    isolationPolicy: { schema: 'sks.glm-naruto-isolation-policy.v1', requested: 'patch-envelope-only', selected: 'patch-envelope-only', honest: true, reason: 'test', blockers: [], fallback_allowed: false, workers_write_main_workspace: false },
    scheduler: { max_observed_active_workers: 1, queue_drained: true, backpressure_events: 0 },
    selectedPatchIds: ['w1'],
    requirementCoverage: {
      schema: 'sks.glm-naruto-requirement-coverage-summary.v1',
      mission_id: 'M-test',
      required_total: 2,
      required_covered: 1,
      uncovered_required_requirements: ['REQ-002'],
      passed: false,
      requirements: []
    },
    applyTransaction: null,
    secretAudit: { ok: true, findings: [] },
    stopGatePath: path.join(artifactDir, 'stop-gate.json'),
    stopGatePassed: false
  });
  assert.equal(result.passed, false);
  assert.equal(result.seal.status, 'blocked');
  assert.deepEqual(result.seal.requirement_coverage.uncovered_required_requirements, ['REQ-002']);
});
