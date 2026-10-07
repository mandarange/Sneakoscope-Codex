import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { compileExecutionProfile, validateExecutionPlan } from '../pipeline-stage-builder.js';
import { attachOrCreateTask, buildAuthoritySnapshot, buildHandoffEnvelope, buildMissionEnvelope, buildTaskKey, clearTaskLease, fenceTaskResult, intersectAuthorityCapabilities, restoreTaskLedger, taskLedgerSnapshot, transitionTask, transitionTaskState } from '../runtime-core.js';
import { mutationBarrier } from '../runtime-gates.js';
import { appendSiblingMessage, validateSiblingMessage } from '../../agents/agent-message-bus.js';

test('profile compiler owns bounded skips and restores required stages', () => {
  const plan = compileExecutionProfile({
    policy: 'optimize', requestedProfile: 'parallel_fast', sourceDigest: 'a'.repeat(64),
    graphDigest: 'b'.repeat(64), parallelEligible: true,
    stages: [
      { id: 'route_classification', required: true, bypassable: false },
      { id: 'planning_debate', required: false, bypassable: true },
      { id: 'listed_verification', required: true, bypassable: false }
    ]
  });
  assert.equal(plan.execution_profile, 'parallel_fast');
  assert.deepEqual(plan.skipped_stages, ['planning_debate']);
  assert.deepEqual(validateExecutionPlan({ execution_plan: plan }), []);
});

test('mutation cannot run through a fast profile', () => {
  assert.equal(mutationBarrier({ executionProfile: 'direct_fast', stageId: 'publish', readOnly: false }).allowed, false);
  assert.equal(mutationBarrier({ executionProfile: 'baseline', stageId: 'publish', readOnly: false, approval: true }).allowed, true);
});

test('typed envelopes deduplicate task identity and reject invalid transitions', () => {
  const taskKey = buildTaskKey({ planId: 'p', taskId: 't', objective: 'read', baseSnapshotDigest: 'a'.repeat(64) });
  const identity = { plan_id: 'p', task_id: 't', task_key: taskKey, parent_task_id: null, dependency_ids: [], attempt: 1, lease_id: 'lease', fencing_token: 1, base_snapshot_digest: 'a'.repeat(64) };
  const mission = buildMissionEnvelope({ identity, objective: 'read', acceptance: ['ok'], allowed_paths: ['src'], forbidden_paths: ['.sneakoscope/wiki'], tests: [], deadline_ms: null, artifact_contract: 'diff', authority_digest: 'c'.repeat(64) });
  assert.equal(mission.schema, 'sks.mission-envelope.v1');
  const handoff = buildHandoffEnvelope({ identity, changed_paths: ['src/a.ts'], artifact_digest: 'd'.repeat(64), diff_digest: 'e'.repeat(64), tests: [], validation: { ok: true, issues: [] }, conflicts: [], next_action: 'merge_queued', stage_ms: {}, authority_digest: 'c'.repeat(64) });
  assert.equal(handoff.next_action, 'merge_queued');
  assert.equal(transitionTaskState('planned', 'leased'), 'leased');
  assert.throws(() => transitionTaskState('verified', 'running'), /invalid_task_transition/);
});

test('task leases attach without rewinding state, retry with a new fence, and restore', () => {
  const taskKey = buildTaskKey({ planId: 'p', taskId: 'first', objective: 'same objective', changedPathsDigest: 'paths' });
  const sameKey = buildTaskKey({ planId: 'p', taskId: 'second', objective: ' same   objective ', changedPathsDigest: 'paths' });
  assert.equal(taskKey, sameKey);
  const first = attachOrCreateTask({ taskKey, planId: 'p', baseSnapshotDigest: 'a'.repeat(64), now: 10_000, ttlMs: 100 });
  assert.equal(transitionTask(taskKey, 'running', first.identity.fencing_token, first.identity.lease_id, 10_001), true);
  const attached = attachOrCreateTask({ taskKey, planId: 'p', baseSnapshotDigest: 'a'.repeat(64), now: 10_010 });
  assert.equal(attached.attached, true);
  assert.equal(attached.state, 'running');
  assert.equal(transitionTask(taskKey, 'failed', first.identity.fencing_token, first.identity.lease_id, 10_020), true);
  const retry = attachOrCreateTask({ taskKey, planId: 'p', baseSnapshotDigest: 'a'.repeat(64), now: 10_030, retry: true });
  assert.equal(retry.identity.attempt, 2);
  assert.equal(retry.identity.fencing_token > first.identity.fencing_token, true);
  assert.equal(fenceTaskResult(taskKey, first.identity.fencing_token, first.identity.lease_id, 10_031), false);
  const snapshot = taskLedgerSnapshot(10_031);
  clearTaskLease(taskKey);
  restoreTaskLedger(snapshot, 10_031);
  assert.equal(taskLedgerSnapshot(10_031)[0]?.identity.fencing_token, retry.identity.fencing_token);
  clearTaskLease(taskKey);
});

test('authority intersection is bounded by parent consent, capabilities, and paths', () => {
  const main = buildAuthoritySnapshot({ id: 'authority', revision: 2, mode: 'NARUTO', consent: true, policy_revision: 'policy', risk_tier: 'normal', tool_allowlist: ['read', 'write'], data_classification: ['source'], mutation_class: 'write', allowed_paths: ['src'] });
  const allowed = intersectAuthorityCapabilities({ main, roleTools: ['read', 'write', 'admin'], policyTools: ['read', 'write'], leaseTools: ['read', 'write'], allowedPaths: ['src/core'] });
  assert.deepEqual(allowed.tools, ['read', 'write']);
  assert.deepEqual(allowed.paths, ['src/core']);
  assert.equal(allowed.ok, true);
  const denied = intersectAuthorityCapabilities({ main, roleTools: ['admin'], policyTools: ['admin'], leaseTools: ['admin'], allowedPaths: ['.sneakoscope/wiki'] });
  assert.equal(denied.ok, false);
  assert.ok(denied.blockers.includes('capability_intersection_empty'));
  assert.ok(denied.blockers.includes('path_outside_main_authority'));
});

test('sibling relay is typed, bounded, same-plan, permission-aware, and idempotent', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-sibling-'));
  await fsp.writeFile(path.join(root, 'agent-events.jsonl'), '');
  await fsp.writeFile(path.join(root, 'agent-messages.jsonl'), '');
  const baseNow = Date.now();
  const created = new Date(baseNow).toISOString();
  const expires = new Date(baseNow + 60_000).toISOString();
  const input = {
    message_id: 'message-1', sender_task_id: 'child-a', recipient_task_id: 'child-b', mission_id: 'mission-1', plan_id: 'plan-1',
    correlation_task_key: 'task-key', kind: 'evidence_request' as const, body: 'Please verify the bounded source evidence.', created_at: created, expires_at: expires
  };
  const options = { planId: 'plan-1', parentTaskId: 'parent', senderParentTaskId: 'parent', recipientParentTaskId: 'parent', allowedRecipients: ['child-b'], senderCapabilities: ['sibling_discussion'], recipientCapabilities: ['sibling_discussion'], now: baseNow + 1 };
  const first = await appendSiblingMessage(root, input, options);
  assert.equal(first.duplicate, false);
  const duplicate = await appendSiblingMessage(root, input, options);
  assert.equal(duplicate.duplicate, true);
  const raw = await fsp.readFile(path.join(root, 'agent-messages.jsonl'), 'utf8');
  assert.equal(raw.includes(input.body), false);
  assert.equal(raw.includes(first.body_digest), true);
  assert.equal(validateSiblingMessage({ ...first, plan_id: 'other' }, baseNow + 1, { expectedPlanId: 'plan-1' }).ok, false);
  await assert.rejects(() => appendSiblingMessage(root, { ...input, message_id: 'message-2', plan_id: 'plan-2' }, options), /cross_plan/);
  await assert.rejects(() => appendSiblingMessage(root, { ...input, message_id: 'message-3', recipient_task_id: 'child-c' }, options), /recipient_denied/);
  await assert.rejects(() => appendSiblingMessage(root, { ...input, message_id: 'message-4', body: 'please spawn another worker' }, options), /action_or_sensitive/);
  await assert.rejects(() => appendSiblingMessage(root, { ...input, message_id: 'message-5', expires_at: new Date(baseNow + 400_000).toISOString() }, options), /ttl/);
  await fsp.rm(root, { recursive: true, force: true });
});
