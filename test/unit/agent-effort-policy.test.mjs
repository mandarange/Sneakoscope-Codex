import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentRoster } from '../../dist/core/agents/agent-roster.js';
import { decideAgentEffort } from '../../dist/core/agents/agent-effort-policy.js';

test('native agent effort policy assigns high effort to safety and release lanes', () => {
  const safety = decideAgentEffort({
    persona: { id: 'agent_security', role: 'safety', stable_id: 'security', risk_focus: 'secret leakage' },
    prompt: 'simple docs note'
  });
  const release = decideAgentEffort({
    persona: { id: 'agent_release', role: 'release', stable_id: 'release', risk_focus: 'publish metadata' },
    prompt: 'publish release readiness'
  });

  assert.equal(safety.reasoning_effort, 'high');
  assert.equal(release.reasoning_effort, 'high');
  assert.equal(safety.dynamic, true);
  assert.ok(safety.escalation_triggers.some((trigger) => trigger.includes('DB/security/release')));
});

test('native agent roster records per-agent dynamic effort policy', () => {
  const roster = buildAgentRoster({ agents: 5, concurrency: 2, prompt: 'multi-session release DB safety orchestration' });

  assert.equal(roster.effort_policy.schema, 'sks.agent-effort-policy.v1');
  assert.equal(roster.effort_policy.dynamic, true);
  assert.equal(roster.roster.length, 5);
  assert.equal(roster.concurrency, 2);
  assert.ok(roster.roster.every((agent) => agent.reasoning_effort && agent.reasoning_profile));
  assert.ok(roster.roster.some((agent) => agent.reasoning_effort === 'high'));
  assert.ok(roster.roster.every((agent) => agent.dynamic_effort_policy.escalation_triggers.length > 0));
});
