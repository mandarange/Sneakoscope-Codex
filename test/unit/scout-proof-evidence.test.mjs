import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMission } from '../../src/core/mission.mjs';
import { runFiveScoutIntake } from '../../src/core/scouts/scout-runner.mjs';
import { readScoutProofEvidence } from '../../src/core/scouts/scout-proof-evidence.mjs';

test('readScoutProofEvidence returns the completion proof scout contract', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-scout-proof-'));
  const { id } = await createMission(root, { mode: 'team', prompt: 'fixture' });
  await runFiveScoutIntake(root, { missionId: id, route: '$Team', task: 'fixture', mock: true });
  const evidence = await readScoutProofEvidence(root, id);
  assert.equal(evidence.schema, 'sks.scout-proof-evidence.v1');
  assert.equal(evidence.scout_count, 5);
  assert.equal(evidence.completed_scouts, 5);
  assert.equal(evidence.gate, 'passed');
  assert.equal(evidence.read_only_confirmed, true);
});
