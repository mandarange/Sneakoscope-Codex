import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { maybeFinalizeRoute } from '../../src/core/proof/auto-finalize.mjs';
import { writeJsonAtomic } from '../../src/core/fsx.mjs';

test('maybeFinalizeRoute writes a route completion proof when gate passes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-auto-finalize-'));
  const missionId = 'M-auto-finalize';
  const dir = path.join(root, '.sneakoscope', 'missions', missionId);
  await fs.mkdir(dir, { recursive: true });
  const gate = { passed: true };
  await writeJsonAtomic(path.join(dir, 'team-gate.json'), gate);
  const result = await maybeFinalizeRoute(root, { missionId, route: '$Team', gateFile: 'team-gate.json', gate, mock: true });
  assert.equal(result.ok, true);
  const proof = JSON.parse(await fs.readFile(path.join(dir, 'completion-proof.json'), 'utf8'));
  assert.equal(proof.schema, 'sks.completion-proof.v1');
  assert.equal(proof.route, '$Team');
});
