import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('agent cleanup executor dry-run plans namespaced cleanup', async () => {
  const mod = await import('../../dist/core/agents/agent-cleanup-executor.js');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-cleanup-test-'));
  const missionDir = path.join(root, '.sneakoscope', 'missions', 'M-test');
  const agentRoot = path.join(missionDir, 'agents');
  const temp = path.join(os.tmpdir(), 'sks-cleanuphash-temp');
  await fs.mkdir(path.join(agentRoot, 'sessions'), { recursive: true });
  await fs.mkdir(temp, { recursive: true });
  await fs.writeFile(path.join(agentRoot, 'agent-sessions.json'), JSON.stringify({ sessions: {} }));
  await fs.writeFile(path.join(missionDir, 'project-session-namespace.json'), JSON.stringify({ root_hash: 'cleanuphash', orphan_temp_dirs: [temp] }));
  const proof = await mod.runAgentCleanupExecutor({ missionDir, dryRun: true });
  assert.equal(proof.dry_run, true);
  assert.ok(proof.orphan_temp_dirs_found.includes(temp));
});
