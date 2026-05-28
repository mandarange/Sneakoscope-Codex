#!/usr/bin/env node
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.mjs';
import { writeReport } from './agent-patch-swarm-gate-lib.mjs';

const fake = await importDist('core/agents/agent-runner-fake.js');
const schema = await importDist('core/agents/agent-patch-schema.js');
const result = await fake.runFakeAgent(
  { id: 'agent-a', session_id: 'session-a', slot_id: 'slot-a', generation_index: 1, persona_id: 'implementer' },
  { id: 'slice-a', write_paths: ['fixture-a.txt'], micro_win_id: 'micro-win-a' },
  { missionId: 'mission-a', route: '$Agent' }
);
const envelope = result.patch_envelopes?.[0];
const validation = envelope ? schema.validateAgentPatchEnvelope(envelope) : { ok: false, violations: ['missing_envelope'] };
const report = { schema: 'sks.agent-patch-envelope-extraction-check.v1', ok: validation.ok, result, envelope, validation };
writeReport('agent-patch-envelope-extraction', report);
assertGate(Array.isArray(result.patch_envelopes) && result.patch_envelopes.length === 1, 'fake agent must emit one patch envelope for a write slice', report);
assertGate(validation.ok === true, 'emitted patch envelope must validate', report);
assertGate(envelope.session_id && envelope.slot_id && Number.isFinite(envelope.generation_index), 'patch envelope must include session/slot/generation metadata', report);
assertGate(envelope.lease_id || envelope.lease_proof?.lease_id, 'patch envelope must include a lease id', report);
emitGate('agent:patch-envelope-extraction', { envelope_count: result.patch_envelopes.length });
