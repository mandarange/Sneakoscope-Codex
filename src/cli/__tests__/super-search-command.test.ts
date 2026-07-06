import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { COMMANDS } from '../command-registry.js';
import { superSearchCommand } from '../super-search-command.js';

test('command registry exposes Super-Search without legacy aliases', () => {
  assert.ok(COMMANDS['super-search']);
  assert.equal(Object.hasOwn(COMMANDS, ['insane', 'search'].join('-')), false);
  assert.equal(Object.hasOwn(COMMANDS, ['ultra', 'search'].join('-')), false);
});

test('parallel Super-Search runs do not collide on timestamp-only mission ids', async () => {
  const cwd = process.cwd();
  const originalNow = Date.now;
  const originalLog = console.log;
  const originalExitCode = process.exitCode;
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-super-search-ids-'));
  Date.now = () => 1783327200000;
  console.log = () => {};
  process.exitCode = undefined;
  try {
    process.chdir(temp);
    const [first, second] = await Promise.all([
      superSearchCommand('run', ['first docs query', '--mode', 'fast', '--json']),
      superSearchCommand('run', ['second docs query', '--mode', 'fast', '--json'])
    ]);
    assert.notEqual(first.mission_id, second.mission_id);
    assert.notEqual(first.artifact_dir, second.artifact_dir);
  } finally {
    process.chdir(cwd);
    Date.now = originalNow;
    console.log = originalLog;
    process.exitCode = originalExitCode;
    await fs.rm(temp, { recursive: true, force: true });
  }
});
