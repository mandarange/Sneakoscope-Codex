import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('sks agent run writes native proof evidence in mock mode', async () => {
  const repo = process.cwd();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-agent-command-'));
  const bin = path.join(repo, 'dist', 'bin', 'sks.js');
  try { await fs.access(bin); } catch { return; }
  const run = spawnSync(process.execPath, [bin, 'agent', 'run', 'fixture native agent task', '--mock', '--json'], {
    cwd: root,
    env: { ...process.env, SKS_DISABLE_UPDATE_CHECK: '1' },
    encoding: 'utf8'
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const parsed = JSON.parse(run.stdout);
  assert.equal(parsed.schema, 'sks.agent-run.v1');
  assert.equal(parsed.backend, 'fake');
  const proof = JSON.parse(await fs.readFile(path.join(root, '.sneakoscope', 'missions', parsed.mission_id, 'agents', 'agent-proof-evidence.json'), 'utf8'));
  assert.equal(proof.schema, 'sks.agent-proof-evidence.v1');
  assert.equal(proof.real_parallel_claim, false);
  assert.equal(proof.all_sessions_closed, true);
  assert.equal(proof.closed_session_count, 5);
  const agentRoot = path.join(root, '.sneakoscope', 'missions', parsed.mission_id, 'agents');
  const cleanup = JSON.parse(await fs.readFile(path.join(agentRoot, 'agent-cleanup.json'), 'utf8'));
  const trust = JSON.parse(await fs.readFile(path.join(agentRoot, 'agent-trust-report.json'), 'utf8'));
  const wrongness = JSON.parse(await fs.readFile(path.join(agentRoot, 'agent-wrongness-records.json'), 'utf8'));
  const outputTails = JSON.parse(await fs.readFile(path.join(agentRoot, 'agent-output-tails.json'), 'utf8'));
  const timeoutKill = JSON.parse(await fs.readFile(path.join(agentRoot, 'agent-timeout-kill-report.json'), 'utf8'));
  assert.equal(cleanup.schema, 'sks.agent-cleanup.v1');
  assert.equal(cleanup.all_sessions_closed, true);
  assert.equal(trust.agent_orchestration.all_sessions_closed, true);
  assert.equal(trust.agent_orchestration.output_tail_report, 'agent-output-tails.json');
  assert.equal(timeoutKill.schema, 'sks.agent-timeout-kill-report.v1');
  assert.equal(timeoutKill.killed_sessions.length, 0);
  assert.equal(outputTails.schema, 'sks.agent-output-tails.v1');
  assert.equal(wrongness.schema, 'sks.agent-wrongness-records.v1');
});
