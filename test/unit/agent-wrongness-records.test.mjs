import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeAgentWrongnessRecords } from '../../dist/core/agents/agent-wrongness.js';

test('agent wrongness memory records native kernel blocker classes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-agent-wrongness-'));
  const report = await writeAgentWrongnessRecords(root, [
    'recursion:sks_team_nested',
    'lease_conflict:src/core/example.ts',
    'session_open:native_agent_1',
    'schema_invalid:agent-result',
    'stale_heartbeat:native_agent_2',
    'legacy_multiagent_runtime:removed_route'
  ]);
  const kinds = new Set(report.records.map((record) => record.kind));
  assert.equal(kinds.has('recursion_attempt'), true);
  assert.equal(kinds.has('lease_conflict'), true);
  assert.equal(kinds.has('session_not_closed'), true);
  assert.equal(kinds.has('schema_invalid_output'), true);
  assert.equal(kinds.has('stale_heartbeat'), true);
  assert.equal(kinds.has('legacy_multiagent_runtime_usage_attempt'), true);

  const persisted = JSON.parse(await fs.readFile(path.join(root, 'agent-wrongness-records.json'), 'utf8'));
  assert.equal(persisted.records.length, 6);
});
