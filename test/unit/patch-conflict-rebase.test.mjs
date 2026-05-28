import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { InMemoryAgentPatchQueue } from '../../dist/core/agents/agent-patch-queue.js';
import { executeAgentPatchConflictRebase } from '../../dist/core/agents/agent-patch-conflict-rebase.js';

test('patch conflict rebase serializes same-file groups and records attempts', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-rebase-test-'));
  await fs.writeFile(path.join(root, 'same.txt'), 'one\n');
  const artifactsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-rebase-artifacts-'));
  const queue = new InMemoryAgentPatchQueue();
  queue.enqueue({ agent_id: 'agent-a', session_id: 's-a', slot_id: 'slot-a', generation_index: 1, lease_id: 'lease-a', rollback_hint: { node_id: 'rollback-a' }, operations: [{ op: 'replace', path: 'same.txt', search: 'one', replace: 'two' }] });
  queue.enqueue({ agent_id: 'agent-b', session_id: 's-b', slot_id: 'slot-b', generation_index: 1, lease_id: 'lease-b', rollback_hint: { node_id: 'rollback-b' }, operations: [{ op: 'replace', path: 'same.txt', search: 'two', replace: 'three' }] });
  const entries = queue.queued();
  const rebase = await executeAgentPatchConflictRebase(root, entries, {
    serial_merge_groups: [{ group_id: 'same-1', reason: 'parallel_write_conflict', file: 'same.txt', entry_ids: entries.map((entry) => entry.id) }]
  }, { artifactsDir });
  assert.equal(rebase.ok, true);
  assert.equal(rebase.rebase_attempt_count, 2);
  assert.equal(await fs.readFile(path.join(root, 'same.txt'), 'utf8'), 'three\n');
  assert.deepEqual(rebase.succeeded_entry_ids.sort(), entries.map((entry) => entry.id).sort());
});

test('patch conflict rebase blocks unleased groups by policy', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-rebase-blocked-'));
  const queue = new InMemoryAgentPatchQueue();
  queue.enqueue({ agent_id: 'agent-a', session_id: 's-a', slot_id: 'slot-a', generation_index: 1, lease_id: 'lease-a', rollback_hint: { node_id: 'rollback-a' }, operations: [{ op: 'write', path: 'a.txt', content: 'a\n' }] });
  const entry = queue.queued()[0];
  const rebase = await executeAgentPatchConflictRebase(root, [entry], {
    serial_merge_groups: [{ group_id: 'blocked-1', reason: 'lease_path_not_allowed', file: 'a.txt', entry_ids: [entry.id] }]
  });
  assert.equal(rebase.ok, false);
  assert.deepEqual(rebase.blocked_entry_ids, [entry.id]);
  assert.match(rebase.blockers.join('\n'), /serial_rebase_blocked_by_policy/);
});
