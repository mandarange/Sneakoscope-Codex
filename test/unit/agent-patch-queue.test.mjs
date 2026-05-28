import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { InMemoryAgentPatchQueue } from '../../dist/core/agents/agent-patch-queue.js';
import { PersistentAgentPatchQueueStore } from '../../dist/core/agents/agent-patch-queue-store.js';

test('agent patch queue records transitions and ownership ledger', () => {
  const queue = new InMemoryAgentPatchQueue();
  const entry = queue.enqueue({
    agent_id: 'agent-a',
    session_id: 'session-a',
    slot_id: 'slot-a',
    generation_index: 1,
    lease_id: 'lease-a',
    rollback_hint: { node_id: 'rollback-a' },
    operations: [{ op: 'write', path: 'a.txt', content: 'a' }]
  }, { mission_id: 'M-test', route: '$Team' });
  queue.markApplying(entry.id);
  queue.markApplied(entry.id);
  const json = queue.toJSON();
  assert.equal(json.events.length, 3);
  assert.equal(json.ownership_ledger[0].lease_id, 'lease-a');
  assert.equal(json.ownership_ledger[0].mission_id, 'M-test');
  assert.equal(json.ownership_ledger[0].slot_id, 'slot-a');
  assert.deepEqual(json.ownership_ledger[0].write_paths, ['a.txt']);
});

test('persistent agent patch queue writes queue, events, and ownership artifacts', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-patch-queue-store-'));
  const store = new PersistentAgentPatchQueueStore(root);
  const entry = await store.enqueue({
    agent_id: 'agent-a',
    session_id: 'session-a',
    slot_id: 'slot-a',
    generation_index: 2,
    lease_proof: { lease_id: 'lease-a', allowed_paths: ['a.txt'] },
    rollback_hint: { node_id: 'rollback-a' },
    operations: [{ op: 'write', path: 'a.txt', content: 'a' }]
  }, { mission_id: 'M-test', route: '$Team' });
  await store.markApplied(entry.id);
  const queue = JSON.parse(await fs.readFile(path.join(root, 'agent-patch-queue.json'), 'utf8'));
  const events = await fs.readFile(path.join(root, 'agent-patch-queue-events.jsonl'), 'utf8');
  const ledger = JSON.parse(await fs.readFile(path.join(root, 'agent-patch-ownership-ledger.json'), 'utf8'));
  assert.equal(queue.entries[0].mission_id, 'M-test');
  assert.equal(queue.entries[0].generation_index, 2);
  assert.match(events, /"event_type":"enqueue"/);
  assert.equal(ledger.entries[0].status, 'applied');
});
