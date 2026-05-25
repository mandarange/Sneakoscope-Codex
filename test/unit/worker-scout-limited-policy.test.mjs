import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { validateWorkerScoutEvidence } from '../../dist/core/agents/scout-policy.js';

test('allows only worker-local Scout evidence paths', () => {
  const root = path.join(process.cwd(), '.sneakoscope/missions/M-fixture/agents');
  assert.equal(validateWorkerScoutEvidence(root, { agent_id: 'a1', artifact_path: 'sessions/a1/worker-scout/evidence.json' }).ok, true);
  assert.equal(validateWorkerScoutEvidence(root, { agent_id: 'a1', artifact_path: '../scout-ledger.json' }).ok, false);
});
