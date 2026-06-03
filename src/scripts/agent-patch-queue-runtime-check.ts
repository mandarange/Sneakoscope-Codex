#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js';
import { readJson, writeReport } from './agent-patch-swarm-gate-lib.js';

const storeMod = await importDist('core/agents/agent-patch-queue-store.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-patch-queue-'));
const store = new storeMod.PersistentAgentPatchQueueStore(dir);
const entry = await store.enqueue({
  schema: 'sks.agent-patch-envelope.v1',
  agent_id: 'agent-a',
  session_id: 'session-a',
  slot_id: 'slot-a',
  generation_index: 1,
  lease_id: 'lease-a',
  lease_proof: { lease_id: 'lease-a', allowed_paths: ['a.txt'], verification_node_id: 'verify-a', rollback_node_id: 'rollback-a' },
  rollback_hint: { node_id: 'rollback-a' },
  operations: [{ op: 'write', path: 'a.txt', content: 'a\n' }]
}, { mission_id: 'mission-a', route: '$Agent' });
await store.markApplying(entry.id);
await store.markApplied(entry.id);
await store.markVerified(entry.id);
const queue = readJson(path.join(dir, 'agent-patch-queue.json'));
const ownership = readJson(path.join(dir, 'agent-patch-ownership-ledger.json'));
const events = fs.readFileSync(path.join(dir, 'agent-patch-queue-events.jsonl'), 'utf8').trim().split(/\n+/).filter(Boolean).map(JSON.parse);
const report = { schema: 'sks.agent-patch-queue-runtime-check.v1', ok: true, artifact_dir: dir, queue, ownership, events };
writeReport('agent-patch-queue-runtime', report);
assertGate(queue.entries?.[0]?.mission_id === 'mission-a', 'queue entry must include mission id', report);
assertGate(queue.entries?.[0]?.route === '$Agent', 'queue entry must include route', report);
assertGate(queue.entries?.[0]?.status === 'verified', 'queue entry must reach verified state', report);
assertGate(events.length >= 4, 'queue events must record append-only transitions', report);
assertGate(ownership.entries?.[0]?.lease_id === 'lease-a', 'ownership ledger must bind lease id', report);
emitGate('agent:patch-queue-runtime', { event_count: events.length });
