import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeEvidenceIndexForProof } from '../../src/core/evidence/evidence-router.mjs';

test('evidence router blocks missing required artifact paths', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-evidence-router-'));
  await fs.mkdir(path.join(root, '.sneakoscope/missions/M-fixture'), { recursive: true });
  await fs.writeFile(path.join(root, '.sneakoscope/missions/M-fixture/completion-proof.json'), '{}\n');
  const index = await writeEvidenceIndexForProof(root, {
    schema: 'sks.completion-proof.v1',
    mission_id: 'M-fixture',
    route: '$Team',
    status: 'verified_partial',
    evidence: { artifacts: ['missing-gate.json'] },
    claims: [],
    unverified: [],
    blockers: []
  });
  assert.equal(index.status, 'blocked');
  assert.ok(index.issues.some((issue) => issue.includes('required_evidence_path_missing')));
});

test('evidence router lowers fixture evidence trust without blocking it', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-evidence-fixture-'));
  await fs.mkdir(path.join(root, '.sneakoscope/missions/M-fixture'), { recursive: true });
  await fs.writeFile(path.join(root, '.sneakoscope/missions/M-fixture/completion-proof.json'), '{}\n');
  await fs.writeFile(path.join(root, '.sneakoscope/missions/M-fixture/run-gate.json'), '{}\n');
  const index = await writeEvidenceIndexForProof(root, {
    schema: 'sks.completion-proof.v1',
    mission_id: 'M-fixture',
    route: '$Team',
    status: 'verified_partial',
    evidence: { artifacts: ['run-gate.json'] },
    claims: [],
    unverified: ['Route was finalized from an explicit mock fixture command path.'],
    blockers: []
  });
  assert.equal(index.status, 'verified_partial');
  assert.ok(index.records.some((record) => record.source === 'mock' || record.source === 'fixture'));
  assert.equal(index.records.some((record) => record.trust === 'high' && record.source === 'mock'), false);
});
