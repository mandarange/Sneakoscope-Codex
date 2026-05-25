import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeEvidenceIndexForProof } from '../../dist/core/evidence/evidence-router.js';

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

test('evidence router does not mark wrongness memory stale against route events', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-evidence-wrongness-'));
  const missionDir = path.join(root, '.sneakoscope/missions/M-fixture');
  await fs.mkdir(missionDir, { recursive: true });
  await fs.mkdir(path.join(root, '.sneakoscope/wiki'), { recursive: true });
  await fs.writeFile(path.join(missionDir, 'events.jsonl'), '{"ts":"2020-01-02T00:00:00.000Z","event":"fixture"}\n');
  await fs.writeFile(path.join(missionDir, 'completion-proof.json'), '{}\n');
  const ledger = path.join(root, '.sneakoscope/wiki/wrongness-ledger.json');
  await fs.writeFile(ledger, '{"schema":"sks.triwiki-wrongness-ledger.v1","records":[]}\n');
  await fs.utimes(ledger, new Date('2020-01-01T00:00:00.000Z'), new Date('2020-01-01T00:00:00.000Z'));

  const index = await writeEvidenceIndexForProof(root, {
    schema: 'sks.completion-proof.v1',
    mission_id: 'M-fixture',
    route: '$Team',
    status: 'verified_partial',
    evidence: {},
    claims: [],
    unverified: [],
    blockers: []
  });

  const wrongness = index.records.find((record) => record.kind === 'wrongness');
  assert.ok(wrongness);
  assert.equal(wrongness.freshness, 'fresh');
  assert.equal(wrongness.issues.includes('stale'), false);
  assert.equal(index.issues.some((issue) => issue.includes('wrongness-ledger.json:stale')), false);
});
