import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { coordinateAgentPatchMerge, writeAgentMergeCoordinatorArtifacts } from '../../dist/core/agents/agent-merge-coordinator.js';
import { InMemoryAgentPatchQueue } from '../../dist/core/agents/agent-patch-queue.js';

test('agent merge coordinator reports parallel batches and serial conflicts', () => {
  const clean = coordinateAgentPatchMerge([
    { schema: 'sks.agent-patch-envelope.v1', agent_id: 'a', session_id: 's-a', slot_id: 'slot-a', generation_index: 1, lease_id: 'lease-a', rollback_hint: { node_id: 'ra' }, operations: [{ op: 'write', path: 'a.txt', content: 'a' }] },
    { schema: 'sks.agent-patch-envelope.v1', agent_id: 'b', session_id: 's-b', slot_id: 'slot-b', generation_index: 1, lease_id: 'lease-b', rollback_hint: { node_id: 'rb' }, operations: [{ op: 'write', path: 'b.txt', content: 'b' }] }
  ]);
  const conflict = coordinateAgentPatchMerge([
    { schema: 'sks.agent-patch-envelope.v1', agent_id: 'a', session_id: 's-a', slot_id: 'slot-a', generation_index: 1, lease_id: 'lease-a', rollback_hint: { node_id: 'ra' }, operations: [{ op: 'write', path: 'same.txt', content: 'a' }] },
    { schema: 'sks.agent-patch-envelope.v1', agent_id: 'b', session_id: 's-b', slot_id: 'slot-b', generation_index: 1, lease_id: 'lease-b', rollback_hint: { node_id: 'rb' }, operations: [{ op: 'write', path: './same.txt', content: 'b' }] }
  ]);
  assert.equal(clean.ok, true);
  assert.ok(clean.parallel_batches.length >= 1);
  assert.ok(clean.parallel_apply_groups.length >= 1);
  assert.equal(conflict.ok, false);
  assert.ok(conflict.serial_conflicts.length >= 1);
});

test('agent merge coordinator accepts queue entries and writes plan artifacts', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-merge-artifacts-'));
  const queue = new InMemoryAgentPatchQueue();
  queue.enqueue({ schema: 'sks.agent-patch-envelope.v1', agent_id: 'a', session_id: 's-a', slot_id: 'slot-a', generation_index: 1, lease_id: 'lease-a', operations: [{ op: 'replace', path: 'a.txt', search: 'a', replace: 'aa' }] });
  queue.enqueue({ schema: 'sks.agent-patch-envelope.v1', agent_id: 'b', session_id: 's-b', slot_id: 'slot-b', generation_index: 1, lease_id: 'lease-b', operations: [{ op: 'replace', path: 'b.txt', search: 'b', replace: 'bb' }] });
  const report = coordinateAgentPatchMerge(queue.queued());
  await writeAgentMergeCoordinatorArtifacts(root, report);
  const graph = JSON.parse(await fs.readFile(path.join(root, 'agent-patch-conflict-graph.json'), 'utf8'));
  const plan = JSON.parse(await fs.readFile(path.join(root, 'agent-patch-apply-plan.json'), 'utf8'));
  const order = JSON.parse(await fs.readFile(path.join(root, 'agent-patch-apply-order.json'), 'utf8'));
  assert.equal(report.ok, true);
  assert.equal(graph.nodes.length, 2);
  assert.equal(plan.parallel_apply_groups[0].entry_ids.length, 2);
  assert.deepEqual(order.order, ['parallel-001']);
});
