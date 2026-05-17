import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMission } from '../../src/core/mission.mjs';
import { maybeFinalizeRoute } from '../../src/core/proof/auto-finalize.mjs';
import { writeJsonAtomic } from '../../src/core/fsx.mjs';

test('route auto-finalizer includes evidence.scouts', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-scout-proof-evidence-'));
  const { id, dir } = await createMission(root, { mode: 'team', prompt: 'fixture' });
  await writeJsonAtomic(path.join(dir, 'team-gate.json'), { passed: true });
  await maybeFinalizeRoute(root, { missionId: id, route: '$Team', gateFile: 'team-gate.json', mock: true });
  const proof = JSON.parse(await fs.readFile(path.join(dir, 'completion-proof.json'), 'utf8'));
  assert.equal(proof.evidence.scouts.schema, 'sks.scout-proof-evidence.v2');
  assert.equal(proof.evidence.scouts.completed_scouts, 5);
  assert.equal(proof.evidence.scouts.gate, 'passed');
});
