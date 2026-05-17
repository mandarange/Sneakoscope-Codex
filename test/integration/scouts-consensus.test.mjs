import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMission } from '../../src/core/mission.mjs';
import { runFiveScoutIntake } from '../../src/core/scouts/scout-runner.mjs';

test('five-scout runner writes consensus and handoff', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-scout-consensus-'));
  const { id, dir } = await createMission(root, { mode: 'team', prompt: 'fixture' });
  await runFiveScoutIntake(root, { missionId: id, route: '$Team', task: 'fixture', mock: true });
  const consensus = JSON.parse(await fs.readFile(path.join(dir, 'scout-consensus.json'), 'utf8'));
  const handoff = await fs.readFile(path.join(dir, 'scout-handoff.md'), 'utf8');
  assert.equal(consensus.completed_scouts, 5);
  assert.match(handoff, /Five-Scout Consensus Handoff/);
});
