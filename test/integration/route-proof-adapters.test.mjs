import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeRouteCompletionProof } from '../../dist/core/proof/route-adapter.js';
import { validateRouteCompletionProof } from '../../dist/core/proof/route-proof-gate.js';

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

test('route proof gate blocks problem-bearing proofs without root cause analysis', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-route-proof-root-cause-'));
  await writeRouteCompletionProof(root, {
    missionId: 'M-root-cause-missing',
    route: '$Wiki',
    status: 'verified_partial',
    unverified: ['fallback path used without root cause analysis']
  });
  const missing = await validateRouteCompletionProof(root, {
    missionId: 'M-root-cause-missing',
    route: '$Wiki'
  });
  assert.equal(missing.ok, false);
  assert.ok(missing.issues.includes('root_cause_analysis_missing'));

  await writeRouteCompletionProof(root, {
    missionId: 'M-root-cause-complete',
    route: '$Wiki',
    status: 'verified_partial',
    unverified: ['fallback path used, root cause fixed below'],
    failureAnalysis: {
      status: 'complete',
      root_cause: 'The fallback path stayed reachable because completion proof validation did not demand RCA.',
      corrective_action: 'The route proof gate now requires RCA before problem-bearing completion proofs can pass.',
      evidence: ['src/core/proof/route-proof-gate.ts']
    }
  });
  const complete = await validateRouteCompletionProof(root, {
    missionId: 'M-root-cause-complete',
    route: '$Wiki'
  });
  assert.equal(complete.ok, true);
});
