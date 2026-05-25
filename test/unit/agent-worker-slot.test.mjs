import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentWorkerSlots, closeWorkerSlotsAfterDrain } from '../../dist/core/agents/agent-worker-slot.js';

test('worker slots use stable slot ids and close after drain', () => {
  const slots = createAgentWorkerSlots({ roster: [{ id: 'agent_1', persona_id: 'agent_1', role: 'verifier' }] }, 2);
  assert.deepEqual(slots.map((slot) => slot.slot_id), ['slot-001', 'slot-002']);
  assert.equal(closeWorkerSlotsAfterDrain(slots).every((slot) => slot.status === 'closed'), true);
});
