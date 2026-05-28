import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { InMemoryAgentPatchQueue } from '../../dist/core/agents/agent-patch-queue.js';
import { applyAgentPatchEnvelope, rollbackAgentPatchApply } from '../../dist/core/agents/agent-patch-apply-worker.js';
import { coordinateAgentPatchMerge } from '../../dist/core/agents/agent-merge-coordinator.js';
import { buildAgentPatchProof } from '../../dist/core/agents/agent-patch-proof.js';

test('agent patch kernel queues, merges, applies, and proves disjoint patches', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-agent-patch-test-'));
  await fs.writeFile(path.join(root, 'a.txt'), 'a\n');
  await fs.writeFile(path.join(root, 'b.txt'), 'b\n');
  const queue = new InMemoryAgentPatchQueue();
  queue.enqueue({ agent_id: 'a', session_id: 's-a', slot_id: 'slot-a', generation_index: 1, lease_id: 'lease-a', operations: [{ op: 'replace', path: 'a.txt', search: 'a', replace: 'aa' }] });
  queue.enqueue({ agent_id: 'b', session_id: 's-b', slot_id: 'slot-b', generation_index: 1, lease_id: 'lease-b', operations: [{ op: 'replace', path: 'b.txt', search: 'b', replace: 'bb' }] });
  const merge = coordinateAgentPatchMerge(queue.queued());
  const applyResults = [];
  for (const entry of queue.queued()) {
    queue.markApplying(entry.id);
    const applied = await applyAgentPatchEnvelope(root, entry.envelope);
    if (applied.ok) queue.markApplied(entry.id);
    applyResults.push(applied);
  }
  const proof = buildAgentPatchProof({ queue: queue.toJSON(), merge, applyResults });
  assert.equal(merge.ok, true);
  assert.equal(proof.ok, true);
  assert.equal((await fs.readFile(path.join(root, 'a.txt'), 'utf8')), 'aa\n');
  assert.equal((await fs.readFile(path.join(root, 'b.txt'), 'utf8')), 'bb\n');
});

test('agent patch merge blocks overlapping writes', () => {
  const merge = coordinateAgentPatchMerge([
    { schema: 'sks.agent-patch-envelope.v1', agent_id: 'a', session_id: 's-a', slot_id: 'slot-a', generation_index: 1, lease_id: 'lease-a', rollback_hint: { node_id: 'ra' }, operations: [{ op: 'write', path: 'same.txt', content: 'a' }] },
    { schema: 'sks.agent-patch-envelope.v1', agent_id: 'b', session_id: 's-b', slot_id: 'slot-b', generation_index: 1, lease_id: 'lease-b', rollback_hint: { node_id: 'rb' }, operations: [{ op: 'write', path: './same.txt', content: 'b' }] }
  ]);
  assert.equal(merge.ok, false);
  assert.equal(merge.blockers[0], 'parallel_write_conflict:same.txt');
});

test('agent patch merge blocks parent child overlaps', () => {
  const merge = coordinateAgentPatchMerge([
    { schema: 'sks.agent-patch-envelope.v1', agent_id: 'a', session_id: 's-a', slot_id: 'slot-a', generation_index: 1, lease_id: 'lease-a', rollback_hint: { node_id: 'ra' }, operations: [{ op: 'write', path: 'dir', content: 'a' }] },
    { schema: 'sks.agent-patch-envelope.v1', agent_id: 'b', session_id: 's-b', slot_id: 'slot-b', generation_index: 1, lease_id: 'lease-b', rollback_hint: { node_id: 'rb' }, operations: [{ op: 'write', path: 'dir/file.txt', content: 'b' }] }
  ]);
  assert.equal(merge.ok, false);
  assert.equal(merge.blockers[0], 'subtree_write_conflict:dir<->dir/file.txt');
});

test('agent patch apply is atomic when a later operation is blocked', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-agent-patch-atomic-'));
  await fs.writeFile(path.join(root, 'safe.txt'), 'before\n');
  const result = await applyAgentPatchEnvelope(root, {
    schema: 'sks.agent-patch-envelope.v1',
    agent_id: 'atomic',
    session_id: 's-atomic',
    slot_id: 'slot-atomic',
    generation_index: 1,
    lease_id: 'lease-atomic',
    operations: [
      { op: 'replace', path: 'safe.txt', search: 'before', replace: 'after' },
      { op: 'write', path: '.codex/blocked.txt', content: 'nope' }
    ]
  });
  assert.equal(result.ok, false);
  assert.equal(await fs.readFile(path.join(root, 'safe.txt'), 'utf8'), 'before\n');
  assert.deepEqual(result.changed_files, []);
});

test('agent patch rollback restores existing files and removes created files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-agent-patch-rollback-'));
  await fs.writeFile(path.join(root, 'existing.txt'), 'before\n');
  const applied = await applyAgentPatchEnvelope(root, {
    schema: 'sks.agent-patch-envelope.v1',
    agent_id: 'rollback',
    session_id: 's-rollback',
    slot_id: 'slot-rollback',
    generation_index: 1,
    lease_id: 'lease-rollback',
    rollback_hint: { node_id: 'rollback-a' },
    operations: [
      { op: 'replace', path: 'existing.txt', search: 'before', replace: 'after' },
      { op: 'write', path: 'created.txt', content: 'created\n' }
    ]
  });
  assert.equal(applied.ok, true);
  const rolledBack = await rollbackAgentPatchApply(root, applied);
  assert.equal(rolledBack.ok, true);
  assert.equal(await fs.readFile(path.join(root, 'existing.txt'), 'utf8'), 'before\n');
  await assert.rejects(fs.readFile(path.join(root, 'created.txt'), 'utf8'), /ENOENT/);
});
