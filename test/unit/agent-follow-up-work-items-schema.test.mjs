import assert from 'node:assert/strict';
import { validateAgentWorkerResult } from '../../dist/core/agents/agent-worker-pipeline.js';
import test from 'node:test';

test('agent result schema accepts valid follow-up work and blocks invalid rows', () => {
  const base = {
    mission_id: 'M',
    agent_id: 'a',
    session_id: 's',
    persona_id: 'p',
    task_slice_id: 'w',
    status: 'done',
    backend: 'fake',
    summary: '',
    findings: [],
    proposed_changes: [],
    changed_files: [],
    lease_compliance: { ok: true, violations: [] },
    artifacts: [],
    blockers: [],
    confidence: 'fixture',
    handoff_notes: '',
    unverified: [],
    writes: [],
    verification: { status: 'fixture', checks: [] },
    recursion_guard: { ok: true, violations: [] }
  };
  const valid = validateAgentWorkerResult({ ...base, follow_up_work_items: [{ id: 'f1', title: 't', description: 'd', required_persona_category: 'verifier', priority: 1, dependencies: [], lease_requirements: [], max_attempts: 1, reason: 'r' }] });
  assert.equal(valid.status, 'done');
  const invalid = validateAgentWorkerResult({ ...base, follow_up_work_items: [{ id: 'bad' }] });
  assert.equal(invalid.status, 'blocked');
});
