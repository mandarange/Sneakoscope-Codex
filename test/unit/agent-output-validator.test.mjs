import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAgentResultSchema } from '../../dist/core/agents/agent-output-validator.js';
import { validateAgentWorkerResult } from '../../dist/core/agents/agent-worker-pipeline.js';

const validResult = {
  schema: 'sks.agent-result.v1',
  mission_id: 'M-test',
  agent_id: 'agent_architect',
  session_id: 'agent_architect-session-01',
  persona_id: 'agent_architect',
  task_slice_id: 'slice-01',
  status: 'done',
  backend: 'fake',
  summary: 'done',
  findings: [],
  proposed_changes: [],
  changed_files: [],
  lease_compliance: { ok: true, violations: [] },
  recursion_guard: { ok: true, violations: [] },
  verification: { status: 'passed', checks: [] },
  blockers: [],
  confidence: 'fixture',
  handoff_notes: '',
  artifacts: [],
  unverified: [],
  writes: []
};

test('agent result schema is recursively enforced', () => {
  assert.equal(validateAgentResultSchema(validResult).ok, true);
  const invalid = { ...validResult, extra: true };
  const validation = validateAgentResultSchema(invalid);
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((issue) => issue.includes('additionalProperties')));
});

test('agent worker result blocks recursive route attempts', () => {
  const result = validateAgentWorkerResult({ ...validResult, summary: 'try sks naruto run nested' });
  assert.equal(result.status, 'blocked');
  assert.ok(result.blockers.some((blocker) => blocker.includes('recursion:sks naruto')));
});
