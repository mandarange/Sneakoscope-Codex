import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

test('agent cleanup apply verifies process exit', async () => {
  const mod = await import('../../dist/core/agents/agent-cleanup-executor.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-cleanup-apply-'));
  const missionDir = path.join(root, '.sneakoscope', 'missions', 'M-apply');
  const agentRoot = path.join(missionDir, 'agents');
  await fs.mkdir(path.join(agentRoot, 'sessions', 'slot-001'), { recursive: true });
  await fs.writeFile(path.join(agentRoot, 'agent-sessions.json'), JSON.stringify({ sessions: { stale: { session_id: 'stale-session', status: 'closed' } } }));
  await fs.writeFile(path.join(missionDir, 'project-session-namespace.json'), JSON.stringify({ root_hash: 'cleanupapply' }));
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  await fs.writeFile(path.join(agentRoot, 'sessions', 'slot-001', 'agent-process-report.json'), JSON.stringify({ session_id: 'stale-session', pid: child.pid, exit_code: 0, project_hash: 'cleanupapply' }));
  const proof = await mod.runAgentCleanupExecutor({ missionDir, apply: true });
  assert.ok(proof.process_exit_verified.includes(String(child.pid)));
});
