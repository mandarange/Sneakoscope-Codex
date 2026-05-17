import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { runProcess } from '../../src/core/fsx.mjs';

export async function runSks(args, { expectCode = 0 } = {}) {
  const result = await runProcess(process.execPath, [path.join(process.cwd(), 'bin/sks.mjs'), ...args], {
    cwd: process.cwd(),
    timeoutMs: 30000,
    maxOutputBytes: 512 * 1024
  });
  assert.equal(result.code, expectCode, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

export async function assertCompletionProof(missionId, route) {
  const file = path.join(process.cwd(), '.sneakoscope', 'missions', missionId, 'completion-proof.json');
  const proof = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(proof.schema, 'sks.completion-proof.v1');
  assert.equal(proof.route, route);
  assert.ok(['verified', 'verified_partial', 'blocked'].includes(proof.status));
  return proof;
}

export async function assertScoutProof(missionId) {
  const file = path.join(process.cwd(), '.sneakoscope', 'missions', missionId, 'completion-proof.json');
  const proof = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(proof.evidence?.scouts?.schema, 'sks.scout-proof-evidence.v1');
  assert.equal(proof.evidence.scouts.scout_count, 5);
  assert.equal(proof.evidence.scouts.completed_scouts, 5);
  assert.equal(proof.evidence.scouts.gate, 'passed');
  assert.equal(proof.evidence.scouts.read_only_confirmed, true);
  return proof.evidence.scouts;
}

export async function assertImageAnchors(missionId, { relations = false } = {}) {
  const file = path.join(process.cwd(), '.sneakoscope', 'missions', missionId, 'image-voxel-ledger.json');
  const ledger = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(ledger.schema, 'sks.image-voxel-ledger.v1');
  assert.ok(ledger.anchors.length >= 1);
  if (relations) assert.ok(ledger.relations.length >= 1);
  return ledger;
}
