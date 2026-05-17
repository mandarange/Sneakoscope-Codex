import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeRouteCompletionProof } from '../../src/core/proof/route-adapter.mjs';

test('route proof adapter writes mission completion proof', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-route-proof-'));
  const written = await writeRouteCompletionProof(root, {
    missionId: 'M-fixture',
    route: '$Team',
    status: 'verified_partial',
    claims: [{ id: 'fixture', status: 'supported' }],
    unverified: ['mock fixture']
  });
  assert.equal(written.ok, true);
  const proof = JSON.parse(await fs.readFile(path.join(root, '.sneakoscope/missions/M-fixture/completion-proof.json'), 'utf8'));
  assert.equal(proof.route, '$Team');
});
