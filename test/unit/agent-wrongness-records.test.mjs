import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeAgentWrongnessRecords } from '../../dist/core/agents/agent-wrongness.js';

test('agent wrongness memory records official-subagent and worker-runtime blocker classes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-agent-wrongness-'));
  const report = await writeAgentWrongnessRecords(root, [
    'recursion:official_subagent_nested_spawn',
    'lease_conflict:src/core/example.ts',
    'session_open:official_subagent_worker_1',
    'schema_invalid:subagent-parent-summary',
    'stale_heartbeat:official_subagent_worker_2',
    'official_subagent_evidence_required_missing'
  ]);
  const kinds = new Set(report.records.map((record) => record.kind));
  assert.equal(kinds.has('recursion_attempt'), true);
  assert.equal(kinds.has('lease_conflict'), true);
  assert.equal(kinds.has('session_not_closed'), true);
  assert.equal(kinds.has('schema_invalid_output'), true);
  assert.equal(kinds.has('stale_heartbeat'), true);
  assert.equal(kinds.has('official_subagent_proof_missing'), true);

  const persisted = JSON.parse(await fs.readFile(path.join(root, 'agent-wrongness-records.json'), 'utf8'));
  assert.equal(persisted.records.length, 6);
});
