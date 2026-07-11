import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('Codex SDK execution policy preserves read-only Naruto scope without blocking implementation workers', async () => {
  const { buildCodexExecutionPolicy } = await import('../../dist/core/codex-control/codex-sdk-config-policy.js');
  const { mapCodexSdkSandboxPolicy } = await import('../../dist/core/codex-control/codex-sdk-sandbox-policy.js');
  const base = {
    route: '$Naruto',
    tier: 'worker',
    missionId: 'M-readonly-sandbox',
    cwd: process.cwd(),
    prompt: 'inspect only',
    outputSchemaId: 'fixture.v1',
    outputSchema: {},
    mutationLedgerRoot: process.cwd()
  };

  const readonlyTask = {
    ...base,
    sandboxPolicy: 'read-only',
    requestedScopeContract: { read_only: true, allowed_paths: [], write_paths: [] }
  };
  assert.equal(mapCodexSdkSandboxPolicy(readonlyTask).sandboxMode, 'read-only');
  assert.equal(buildCodexExecutionPolicy(readonlyTask).sandbox, 'read-only');
  assert.equal(buildCodexExecutionPolicy(readonlyTask).mutation, 'deny');

  const emptyWriteScope = {
    ...base,
    sandboxPolicy: 'workspace-write',
    requestedScopeContract: { read_only: false, allowed_paths: [], write_paths: [] }
  };
  assert.equal(mapCodexSdkSandboxPolicy(emptyWriteScope).sandboxMode, 'read-only');
  assert.equal(buildCodexExecutionPolicy(emptyWriteScope).sandbox, 'read-only');
  assert.equal(buildCodexExecutionPolicy(emptyWriteScope).mutation, 'deny');

  const implementationTask = {
    ...base,
    prompt: 'implement bounded fix',
    sandboxPolicy: 'workspace-write',
    requestedScopeContract: { read_only: false, allowed_paths: ['src/core'], write_paths: ['src/core'] }
  };
  assert.equal(mapCodexSdkSandboxPolicy(implementationTask).sandboxMode, 'workspace-write');
  assert.equal(buildCodexExecutionPolicy(implementationTask).sandbox, 'workspace-write');
  assert.equal(buildCodexExecutionPolicy(implementationTask).mutation, 'ledgered');
});

test('Codex SDK 0.144.1 receives the resolved read-only sandbox in its CLI arguments', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-codex-sdk-sandbox-args-'));
  const fakeCodex = path.join(root, 'fake-codex.mjs');
  const capture = path.join(root, 'args.json');
  await fs.writeFile(fakeCodex, [
    '#!/usr/bin/env node',
    "import fs from 'node:fs';",
    "fs.writeFileSync(process.env.SKS_CAPTURE_ARGS, JSON.stringify(process.argv.slice(2)));",
    "process.stdin.resume();",
    "process.stdin.on('end', () => {",
    "  console.log(JSON.stringify({ type: 'thread.started', thread_id: 'sandbox-test-thread' }));",
    "  console.log(JSON.stringify({ type: 'item.completed', item: { id: 'message-1', type: 'agent_message', text: 'ok' } }));",
    "  console.log(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0 } }));",
    "});",
    ''
  ].join('\n'), 'utf8');
  await fs.chmod(fakeCodex, 0o755);

  const { Codex } = await import('@openai/codex-sdk');
  const { buildCodexExecutionPolicy } = await import('../../dist/core/codex-control/codex-sdk-config-policy.js');
  const task = {
    route: '$Naruto',
    tier: 'worker',
    missionId: 'M-readonly-sdk-args',
    cwd: root,
    prompt: 'inspect only',
    outputSchemaId: 'fixture.v1',
    outputSchema: {},
    sandboxPolicy: 'read-only',
    requestedScopeContract: { read_only: true, allowed_paths: [], write_paths: [] },
    mutationLedgerRoot: root
  };
  const policy = buildCodexExecutionPolicy(task);
  const codex = new Codex({
    codexPathOverride: fakeCodex,
    env: { PATH: process.env.PATH || '', SKS_CAPTURE_ARGS: capture },
    config: {}
  });
  await codex.startThread({ workingDirectory: root, sandboxMode: policy.sandbox }).run('inspect');

  const args = JSON.parse(await fs.readFile(capture, 'utf8'));
  const sandboxIndex = args.indexOf('--sandbox');
  assert.notEqual(sandboxIndex, -1);
  assert.equal(args[sandboxIndex + 1], 'read-only');
  assert.equal(args.includes('workspace-write'), false);
});
