import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { alignCommand } from '../align-command.js';
import { resetVerificationProfileCache } from '../../verification-profile.js';

// A user's project has no config/architecture-map-policy.v1.json; align used to
// fail there with architecture_map_policy_unreadable, and a passing run left an
// open Align route that blocked the next route command until `sks route close`.
test('align run works in a project without an architecture-map policy and closes its own route', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-align-user-project-'));
  const priorCwd = process.cwd();
  const priorThread = process.env.CODEX_THREAD_ID;
  const priorStandalone = process.env.SKS_NARUTO_STANDALONE_CLI;
  const priorExit = process.exitCode;
  const priorLog = console.log;
  const output: string[] = [];
  try {
    const git = (args: string[]) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    git(['init', '-q']);
    git(['config', 'user.email', 'test@example.com']);
    git(['config', 'user.name', 'Test']);
    await fs.mkdir(path.join(root, 'src'), { recursive: true });
    await fs.writeFile(path.join(root, 'src', 'a.ts'), 'export const a = 1;\n');
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'user-project', version: '1.0.0' }));
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'init']);
    process.chdir(root);
    delete process.env.CODEX_THREAD_ID;
    process.env.SKS_NARUTO_STANDALONE_CLI = '1';
    resetVerificationProfileCache();
    console.log = (value: unknown) => { output.push(String(value)); };

    await alignCommand('run', ['--json']);
    const result = JSON.parse(output.pop()!);
    assert.equal(result.ok, true, JSON.stringify(result.gate?.blockers || result));
    assert.equal(result.route_closed, true);
    assert.equal(result.next_action, 'none');

    const state = JSON.parse(await fs.readFile(path.join(root, '.sneakoscope', 'state', 'current.json'), 'utf8'));
    assert.equal(state.mission_id, result.mission_id);
    assert.equal(state.route_closed, true);
    assert.match(String(state.phase), /_CLOSED$/);
  } finally {
    console.log = priorLog;
    process.exitCode = priorExit;
    process.chdir(priorCwd);
    if (priorThread === undefined) delete process.env.CODEX_THREAD_ID; else process.env.CODEX_THREAD_ID = priorThread;
    if (priorStandalone === undefined) delete process.env.SKS_NARUTO_STANDALONE_CLI; else process.env.SKS_NARUTO_STANDALONE_CLI = priorStandalone;
    resetVerificationProfileCache();
    await fs.rm(root, { recursive: true, force: true });
  }
});
