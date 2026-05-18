import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeEvidenceIndexForProof } from '../../src/core/evidence/evidence-router.mjs';
import { validateCompletionContract } from '../../src/core/trust-kernel/completion-contract.mjs';
import { buildRouteCompletionContract } from '../../src/core/trust-kernel/route-contract.mjs';

test('chaos: corrupted proof does not silently pass', () => {
  const proof = { schema: 'bad', route: '$Team', status: 'verified', evidence: {}, claims: [], unverified: [], blockers: [] };
  const contract = buildRouteCompletionContract(proof, { records: [] });
  const validation = validateCompletionContract(contract, proof, { records: [] });
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((issue) => issue.includes('proof:schema')));
});

test('chaos: secret-bearing evidence blocks index', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-chaos-secret-'));
  const dir = path.join(root, '.sneakoscope/missions/M-chaos');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'completion-proof.json'), '{}\n');
  await fs.writeFile(path.join(dir, 'bad-evidence.json'), '{"OPENAI_API_KEY":"sk-proj-abcdefghijklmnop"}\n');
  const index = await writeEvidenceIndexForProof(root, {
    schema: 'sks.completion-proof.v1',
    mission_id: 'M-chaos',
    route: '$Team',
    status: 'verified_partial',
    evidence: { artifacts: ['bad-evidence.json'] },
    claims: [],
    unverified: [],
    blockers: []
  });
  assert.equal(index.status, 'blocked');
  assert.ok(index.issues.some((issue) => issue.includes('plaintext_secret')));
});
