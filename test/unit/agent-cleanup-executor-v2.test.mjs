import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('agent cleanup executor v2 records process-tree dry-run evidence', async () => {
  const mod = await import('../../dist/core/agents/agent-cleanup-executor.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-cleanup-v2-unit-'));
  const missionDir = path.join(root, '.sneakoscope', 'missions', 'M-test');
  const agentRoot = path.join(missionDir, 'agents');
  await fs.mkdir(path.join(agentRoot, 'sessions', 'slot-001'), { recursive: true });
  await fs.writeFile(path.join(agentRoot, 'agent-sessions.json'), JSON.stringify({ sessions: { closed: { session_id: 'closed-session', status: 'closed' } } }));
  await fs.writeFile(path.join(missionDir, 'project-session-namespace.json'), JSON.stringify({ root_hash: 'cleanupv2' }));
  await fs.writeFile(path.join(agentRoot, 'sessions', 'slot-001', 'agent-process-report.json'), JSON.stringify({
    session_id: 'closed-session',
    pid: process.pid,
    exit_code: 0,
    project_hash: 'cleanupv2'
  }));
  const proof = await mod.runAgentCleanupExecutor({ missionDir, dryRun: true });
  assert.equal(proof.schema, 'sks.agent-cleanup-proof.v2');
  assert.ok(proof.process_trees.some((row) => row.target === String(process.pid)));
  assert.ok(proof.sigterm_sent.length === 0);
});
