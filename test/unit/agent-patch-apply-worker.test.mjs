import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { applyAgentPatchEnvelope, rollbackAgentPatchApply } from '../../dist/core/agents/agent-patch-apply-worker.js';

test('agent patch apply worker applies simple unified diff and records hashes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-unified-diff-'));
  await fs.writeFile(path.join(root, 'a.txt'), 'old\n');
  const result = await applyAgentPatchEnvelope(root, {
    schema: 'sks.agent-patch-envelope.v1',
    agent_id: 'agent-a',
    session_id: 'session-a',
    slot_id: 'slot-a',
    generation_index: 1,
    lease_id: 'lease-a',
    operations: [{ op: 'unified_diff', path: 'a.txt', diff: '--- a.txt\n+++ a.txt\n@@\n-old\n+new\n' }]
  });
  assert.equal(result.ok, true);
  assert.equal(await fs.readFile(path.join(root, 'a.txt'), 'utf8'), 'new\n');
  assert.ok(result.after_hashes['a.txt']);
  assert.ok(result.before_hashes['a.txt']);
  assert.ok(result.latency_ms >= 0);
});

test('agent patch apply worker applies multi-hunk unified diff with context', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-unified-diff-multi-'));
  await fs.writeFile(path.join(root, 'a.txt'), 'one\nold-a\nthree\nold-b\nfive\n');
  const result = await applyAgentPatchEnvelope(root, {
    schema: 'sks.agent-patch-envelope.v1',
    agent_id: 'agent-a',
    session_id: 'session-a',
    slot_id: 'slot-a',
    generation_index: 1,
    lease_id: 'lease-a',
    operations: [{
      op: 'unified_diff',
      path: 'a.txt',
      diff: '--- a.txt\n+++ a.txt\n@@ -1,3 +1,3 @@\n one\n-old-a\n+new-a\n three\n@@ -3,3 +3,3 @@\n three\n-old-b\n+new-b\n five\n'
    }]
  });
  assert.equal(result.ok, true);
  assert.equal(await fs.readFile(path.join(root, 'a.txt'), 'utf8'), 'one\nnew-a\nthree\nnew-b\nfive\n');
});

test('agent patch rollback blocks when the file changed after apply', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-rollback-hash-'));
  const file = path.join(root, 'a.txt');
  await fs.writeFile(file, 'old\n');
  const apply = await applyAgentPatchEnvelope(root, {
    schema: 'sks.agent-patch-envelope.v1',
    agent_id: 'agent-a',
    session_id: 'session-a',
    slot_id: 'slot-a',
    generation_index: 1,
    lease_id: 'lease-a',
    operations: [{ op: 'replace', path: 'a.txt', search: 'old\n', replace: 'new\n' }]
  });
  assert.equal(apply.ok, true);
  await fs.writeFile(file, 'user edit\n');
  const rollback = await rollbackAgentPatchApply(root, apply);
  assert.equal(rollback.ok, false);
  assert.match(rollback.violations.join('\n'), /rollback_hash_mismatch/);
  assert.equal(await fs.readFile(file, 'utf8'), 'user edit\n');
});

test('agent patch apply worker validates lease scope and writes per-entry dry-run evidence', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-apply-entry-'));
  const artifacts = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-apply-artifacts-'));
  await fs.writeFile(path.join(root, 'a.txt'), 'old\n');
  const result = await applyAgentPatchEnvelope(root, {
    schema: 'sks.agent-patch-envelope.v1',
    agent_id: 'agent-a',
    session_id: 'session-a',
    slot_id: 'slot-a',
    generation_index: 1,
    lease_proof: { lease_id: 'lease-a', allowed_paths: ['a.txt'] },
    verification_hint: { command: 'npm test' },
    operations: [{ op: 'replace', path: 'a.txt', search: 'old', replace: 'new' }]
  }, { dryRun: true, entryId: 'entry-a', artifactsDir: artifacts });
  const artifact = JSON.parse(await fs.readFile(path.join(artifacts, 'agent-patch-apply-result-entry-a.json'), 'utf8'));
  assert.equal(result.ok, true);
  assert.equal(result.status, 'dry_run');
  assert.equal(artifact.entry_id, 'entry-a');
  assert.equal(artifact.verification.hint.command, 'npm test');
  assert.equal(await fs.readFile(path.join(root, 'a.txt'), 'utf8'), 'old\n');
});

test('agent patch rollback blocks symlink targets outside the project root', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-rollback-symlink-root-'));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-rollback-symlink-outside-'));
  await fs.writeFile(path.join(outside, 'target.txt'), 'after\n');
  await fs.symlink(path.join(outside, 'target.txt'), path.join(root, 'link.txt'));
  const rollback = await rollbackAgentPatchApply(root, {
    rollback: [{ path: 'link.txt', existed: true, sha256_after: sha256Text('after\n'), sha256_before: sha256Text('before\n'), content_before: 'before\n' }]
  });
  assert.equal(rollback.ok, false);
  assert.match(rollback.violations.join('\n'), /rollback_target_symlink_outside_root/);
  assert.equal(await fs.readFile(path.join(outside, 'target.txt'), 'utf8'), 'after\n');
});

function sha256Text(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}
