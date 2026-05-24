import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultAgentPersonas, validatePersonaUniqueness } from '../../dist/core/agents/agent-persona.js';

const REQUIRED_STABLE_IDS = [
  'architect',
  'implementer',
  'verifier',
  'safety',
  'integrator',
  'performance',
  'ux-visual',
  'db-guardian',
  'release',
  'docs',
  'type-system',
  'test-runner',
  'security',
  'rollback',
  'git-hygiene',
  'image-voxel',
  'hooks',
  'codex-compat',
  'mad-sks-guard',
  'synthesis'
];

test('default native personas expose the directive persona contract through max cap', () => {
  const personas = defaultAgentPersonas(20);
  assert.deepEqual(personas.map((persona) => persona.stable_id), REQUIRED_STABLE_IDS);
  assert.equal(validatePersonaUniqueness(personas).ok, true);

  for (const persona of personas) {
    assert.ok(persona.id.startsWith('agent_'));
    assert.ok(persona.prompt.includes('OUTPUT SCHEMA'));
    assert.ok(persona.denied_tools.includes('nested-agent-launch'));
    assert.ok(persona.central_ledger_communication_rule.includes('agent-events.jsonl'));
    assert.ok(persona.recursion_ban.includes('nested agent orchestration'));
    assert.ok(persona.expected_artifacts.length >= 1);
    assert.ok(persona.completion_criteria.length >= 1);
    assert.ok(persona.failure_criteria.length >= 1);
    assert.ok(persona.handoff_rules.length >= 1);
    assert.ok(persona.confidence_calibration.includes('direct code'));
    assert.ok(persona.verification_plan.length >= 1);
    assert.ok(persona.wrongness_triggers.length >= 1);
    assert.ok(persona.mock_behavior.includes('fixture-only'));
    assert.ok(persona.real_behavior.includes('actual command'));
    assert.ok(persona.docs_example.includes(persona.stable_id));
  }
});
