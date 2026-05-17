import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runProcess } from '../../src/core/fsx.mjs';

const SOURCE_ROOT = process.cwd();
const missionRoots = new Map();

export async function runSks(args, { expectCode = 0 } = {}) {
  const root = await createHermeticProjectRoot({ fixtureName: args[0] || 'route' });
  const json = await runSksInRoot(root, args, { expectCode });
  const missionId = json?.mission_id || json?.completion_proof?.mission_id || json?.proof?.mission_id;
  if (missionId) missionRoots.set(missionId, root);
  return json;
}

export async function createHermeticProjectRoot({
  fixtureName,
  files = {},
  setup = true
} = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `sks-e2e-${fixtureName || 'route'}-`));
  await fs.writeFile(path.join(root, 'package.json'), `${JSON.stringify({ name: `sks-e2e-${fixtureName || 'route'}`, private: true, version: '0.0.0' }, null, 2)}\n`);
  await fs.writeFile(path.join(root, 'README.md'), '# SKS E2E Hermetic Project\n');
  for (const [rel, body] of Object.entries(files)) {
    const file = path.join(root, rel);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
  }
  await copyFixture('test/fixtures/images/one-by-one.png', root);
  if (setup) await runSksInRoot(root, ['setup', '--local-only', '--json']);
  return root;
}

export async function runSksInRoot(root, args, { expectCode = 0 } = {}) {
  const result = await runProcess(process.execPath, [path.join(SOURCE_ROOT, 'bin', 'sks.mjs'), ...args], {
    cwd: root,
    timeoutMs: 30000,
    maxOutputBytes: 512 * 1024,
    env: { SKS_SKIP_NPM_FRESHNESS_CHECK: '1', CI: 'true' }
  });
  assert.equal(result.code, expectCode, result.stderr || result.stdout);
  const json = JSON.parse(result.stdout);
  if (json?.mission_id) missionRoots.set(json.mission_id, root);
  return json;
}

export async function assertCompletionProof(missionId, route) {
  return assertCompletionProofInRoot(missionRoot(missionId), missionId, route);
}

export async function assertCompletionProofInRoot(root, missionId, route) {
  const file = path.join(root, '.sneakoscope', 'missions', missionId, 'completion-proof.json');
  const proof = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(proof.schema, 'sks.completion-proof.v1');
  assert.equal(proof.route, route);
  assert.ok(['verified', 'verified_partial', 'blocked'].includes(proof.status));
  return proof;
}

export async function assertScoutProof(missionId) {
  const file = path.join(missionRoot(missionId), '.sneakoscope', 'missions', missionId, 'completion-proof.json');
  const proof = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(proof.evidence?.scouts?.schema, 'sks.scout-proof-evidence.v2');
  assert.equal(proof.evidence.scouts.scout_count, 5);
  assert.equal(proof.evidence.scouts.completed_scouts, 5);
  assert.equal(proof.evidence.scouts.gate, 'passed');
  assert.equal(proof.evidence.scouts.read_only_confirmed, true);
  return proof.evidence.scouts;
}

export async function assertImageAnchors(missionId, { relations = false } = {}) {
  return assertImageAnchorsInRoot(missionRoot(missionId), missionId, { relations });
}

export async function assertImageAnchorsInRoot(root, missionId, { relations = false } = {}) {
  const file = path.join(root, '.sneakoscope', 'missions', missionId, 'image-voxel-ledger.json');
  const ledger = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(ledger.schema, 'sks.image-voxel-ledger.v1');
  assert.ok(ledger.anchors.length >= 1);
  if (relations) assert.ok(ledger.relations.length >= 1);
  return ledger;
}

export async function assertNoSourceRepoStateMutation(before, after) {
  assert.deepEqual(after, before);
}

function missionRoot(missionId) {
  const root = missionRoots.get(missionId);
  assert.ok(root, `No hermetic root recorded for mission ${missionId}`);
  return root;
}

async function copyFixture(rel, root) {
  const src = path.join(SOURCE_ROOT, rel);
  const dest = path.join(root, rel);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest).catch(() => {});
}
