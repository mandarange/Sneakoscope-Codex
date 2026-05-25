import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { validateWorkerScoutEvidence } from '../../dist/core/agents/scout-policy.js';

test('worker-local Scout evidence is accepted only in agent session root', () => {
  const root = path.join(process.cwd(), '.sneakoscope/missions/M-fixture/agents');
  const local = validateWorkerScoutEvidence(root, { agent_id: 'agent_1', artifact_path: 'sessions/agent_1/worker-scout/evidence.json' });
  assert.equal(local.ok, true);
  assert.equal(local.central_proof_ssot, false);
});
