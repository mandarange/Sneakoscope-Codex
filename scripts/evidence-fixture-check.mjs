#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeEvidenceIndexForProof } from '../dist/core/evidence/evidence-router.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-evidence-fixture-'));
const mission = path.join(root, '.sneakoscope', 'missions', 'M-evidence');
await fs.mkdir(mission, { recursive: true });
await fs.writeFile(path.join(mission, 'completion-proof.json'), '{}\n');
await fs.writeFile(path.join(mission, 'route-gate.json'), '{}\n');
const index = await writeEvidenceIndexForProof(root, {
  schema: 'sks.completion-proof.v1',
  mission_id: 'M-evidence',
  route: '$Team',
  status: 'verified_partial',
  evidence: { artifacts: ['route-gate.json'] },
  claims: [],
  unverified: ['fixture evidence'],
  blockers: []
});
const ok = index.status === 'verified_partial' && index.records.every((record) => record.source !== 'mock' || record.trust !== 'high');
console.log(JSON.stringify({ schema: 'sks.evidence-fixture-check.v1', ok, status: index.status, records: index.records.length, issues: index.issues }, null, 2));
if (!ok) process.exitCode = 1;
