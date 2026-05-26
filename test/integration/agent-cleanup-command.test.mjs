import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('sks agent cleanup latest emits cleanup executor proof', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-agent-cleanup-command-'));
  await fs.mkdir(path.join(root, '.git'));
  const missionDir = path.join(root, '.sneakoscope', 'missions', 'M-cleanup-command');
  const agentRoot = path.join(missionDir, 'agents');
  await fs.mkdir(path.join(agentRoot, 'sessions'), { recursive: true });
  await fs.mkdir(path.join(root, '.sneakoscope', 'state'), { recursive: true });
  await fs.writeFile(path.join(root, '.sneakoscope', 'state', 'current.json'), JSON.stringify({ mission_id: 'M-cleanup-command', mode: 'AGENT', phase: 'RUNNING' }));
  await fs.writeFile(path.join(missionDir, 'mission.json'), JSON.stringify({ id: 'M-cleanup-command', mode: 'agent', prompt: 'cleanup fixture', created_at: new Date(0).toISOString(), phase: 'RUNNING' }));
  await fs.writeFile(path.join(agentRoot, 'agent-sessions.json'), JSON.stringify({ sessions: {} }));
  await fs.writeFile(path.join(missionDir, 'project-session-namespace.json'), JSON.stringify({ mission_id: 'M-cleanup-command', root_hash: 'hash' }));
  const result = spawnSync(process.execPath, [path.resolve('dist/bin/sks.js'), 'agent', 'cleanup', 'latest', '--dry-run', '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.data.schema, 'sks.agent-cleanup-proof.v1');
});
