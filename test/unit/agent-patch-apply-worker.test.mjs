import test from 'node:test';
import assert from 'node:assert/strict';
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
    operations: [{ op: 'unified_diff', path: 'a.txt', diff: '--- a.txt\n+++ a.txt\n@@\n-old\n+new\n' }]
  });
  assert.equal(result.ok, true);
  assert.equal(await fs.readFile(path.join(root, 'a.txt'), 'utf8'), 'new\n');
  assert.ok(result.after_hashes['a.txt']);
});

test('agent patch apply worker applies multi-hunk unified diff with context', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-unified-diff-multi-'));
  await fs.writeFile(path.join(root, 'a.txt'), 'one\nold-a\nthree\nold-b\nfive\n');
  const result = await applyAgentPatchEnvelope(root, {
    schema: 'sks.agent-patch-envelope.v1',
    agent_id: 'agent-a',
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
    operations: [{ op: 'replace', path: 'a.txt', search: 'old\n', replace: 'new\n' }]
  });
  assert.equal(apply.ok, true);
  await fs.writeFile(file, 'user edit\n');
  const rollback = await rollbackAgentPatchApply(root, apply);
  assert.equal(rollback.ok, false);
  assert.match(rollback.violations.join('\n'), /rollback_hash_mismatch/);
  assert.equal(await fs.readFile(file, 'utf8'), 'user edit\n');
});
