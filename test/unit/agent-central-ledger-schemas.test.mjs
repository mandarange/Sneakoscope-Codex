import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agentCentralLedgerSchemaEntries,
  validateAgentCentralLedgerSchema
} from '../../dist/core/agents/agent-ledger-schemas.js';

test('agent central ledger schemas are closed at the root and recursively validated', () => {
  const entries = agentCentralLedgerSchemaEntries();
  assert.equal(entries.length, 10);
  for (const [schemaId, schema] of entries) {
    assert.equal(schema.additionalProperties, false, schemaId);
  }

  const valid = validateAgentCentralLedgerSchema('sks.agent-message.v1', {
    schema: 'sks.agent-message.v1',
    from: 'agent_a',
    session_id: 'session_a',
    to: 'orchestrator',
    type: 'note',
    body: 'handoff'
  });
  assert.equal(valid.ok, true);

  const invalid = validateAgentCentralLedgerSchema('sks.agent-message.v1', {
    schema: 'sks.agent-message.v1',
    from: 'agent_a',
    session_id: 'session_a',
    to: 'orchestrator',
    type: 'note',
    body: 'handoff',
    extra: true
  });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.issues.some((issue) => issue.includes('additionalProperties')));
});
