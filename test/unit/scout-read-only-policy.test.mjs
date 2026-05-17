import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMission } from '../../src/core/mission.mjs';
import { runFiveScoutIntake } from '../../src/core/scouts/scout-runner.mjs';
import { SCOUT_ROLES } from '../../src/core/scouts/scout-schema.mjs';

test('five-scout runner writes read-only result contracts', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-scout-readonly-'));
  const { id, dir } = await createMission(root, { mode: 'team', prompt: 'fixture' });
  const result = await runFiveScoutIntake(root, { missionId: id, route: '$Team', task: 'fixture', mock: true });
  assert.equal(result.ok, true);
  for (const role of SCOUT_ROLES) {
    const scout = JSON.parse(await fs.readFile(path.join(dir, role.json), 'utf8'));
    assert.equal(scout.read_only, true);
    assert.equal(scout.write_policy, 'read_only');
  }
});
