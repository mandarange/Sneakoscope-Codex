import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentManifest } from '../../agent-bridge/agent-manifest.js';
import { runAgentBridgeContractSmokes } from '../agent-bridge-command.js';

test('agent-bridge contract smokes validate status and Naruto help without starting a mission', async () => {
  const manifest = buildAgentManifest();
  const observed: string[][] = [];
  const result = await runAgentBridgeContractSmokes('/fixture/sks.js', manifest, async (_command, args) => {
    observed.push([...args]);
    const commandArgs = args.slice(1);
    const stdout = commandArgs[0] === 'status'
      ? JSON.stringify({ schema: 'sks.status.v1', ok: true })
      : JSON.stringify({
          schema: 'sks.naruto-subagent-workflow.v1',
          ok: true,
          action: 'help',
          workflow: 'official_codex_subagent',
          max_depth: 1,
          commands: ['run', 'status', 'subagents', 'proof', 'help']
        });
    return { code: 0, stdout, stderr: '', stdoutBytes: stdout.length, stderrBytes: 0, truncated: false, timedOut: false };
  });

  assert.equal(result.status.ok, true);
  assert.equal(result.naruto_help.ok, true);
  assert.equal(result.status.starts_mission, false);
  assert.equal(result.naruto_help.starts_mission, false);
  assert.deepEqual(observed, [
    ['/fixture/sks.js', 'status', '--json'],
    ['/fixture/sks.js', 'naruto', 'help', '--json']
  ]);
  assert.ok(observed.every((args) => !args.includes('run')));
});

test('agent-bridge Naruto help smoke fails on extra stdout or manifest action drift', async () => {
  const manifest = buildAgentManifest();
  const result = await runAgentBridgeContractSmokes('/fixture/sks.js', manifest, async (_command, args) => {
    const commandArgs = args.slice(1);
    const stdout = commandArgs[0] === 'status'
      ? '{}'
      : `${JSON.stringify({
          schema: 'sks.naruto-subagent-workflow.v1',
          action: 'help',
          workflow: 'official_codex_subagent',
          max_depth: 1,
          commands: ['run']
        })}\n{"extra":true}`;
    return { code: 0, stdout, stderr: '', stdoutBytes: stdout.length, stderrBytes: 0, truncated: false, timedOut: false };
  });
  assert.equal(result.status.ok, true);
  assert.equal(result.naruto_help.ok, false);
  assert.deepEqual(result.naruto_help.issues, ['stdout_not_clean_json_object']);
});
