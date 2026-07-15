import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { updateCommandResultRequiresFailureExit } from '../basic-cli.js';

test('update JSON result classifier treats error, failed, and terminal_uncertain states as nonzero outcomes', () => {
  assert.equal(updateCommandResultRequiresFailureExit({ source: 'error' }), true);
  assert.equal(updateCommandResultRequiresFailureExit({ ok: false, status: 'unavailable' }), true);
  assert.equal(updateCommandResultRequiresFailureExit({ ok: true, status: 'failed' }), true);
  assert.equal(updateCommandResultRequiresFailureExit({ ok: true, status: 'terminal_uncertain' }), true);
  assert.equal(updateCommandResultRequiresFailureExit({ ok: true, status: 'updated' }), false);
});

test('status, review, rollback, and now JSON branches preserve machine output while exiting nonzero on failure', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-update-json-exit-'));
  try {
    const env = {
      ...process.env,
      HOME: path.join(temp, 'home'),
      PATH: path.join(temp, 'empty-path'),
      SKS_GLOBAL_ROOT: path.join(temp, 'global'),
      SKS_UPDATE_STATUS_PATH: path.join(temp, 'update-status.json'),
      SKS_DISABLE_UPDATE_CHECK: '0',
      SKS_DISABLE_UPDATE_NOTICE: '0',
      SKS_UPDATE_NOTICE_DISABLE: '0',
      SKS_UPDATE_NOTICE: '1'
    };
    await fs.mkdir(env.HOME, { recursive: true });
    await fs.mkdir(env.PATH, { recursive: true });
    const commands = [
      ['update', 'status', '--refresh', '--json'],
      ['update', 'review', '--version', 'not-semver', '--json'],
      ['update', 'rollback', '--version', 'not-semver', '--json'],
      ['update', 'now', '--version', 'not-semver', '--json']
    ];
    for (const args of commands) {
      const run = spawnSync(process.execPath, ['dist/bin/sks.js', ...args], {
        cwd: process.cwd(),
        env,
        encoding: 'utf8',
        timeout: 30_000
      });
      assert.equal(run.status, 1, `${args.join(' ')}: ${run.stderr || run.stdout}`);
      const value = JSON.parse(run.stdout);
      assert.equal(typeof value.schema, 'string', args.join(' '));
      assert.equal(value.source === 'error' || value.ok === false || ['failed', 'terminal_uncertain'].includes(value.status), true, args.join(' '));
    }
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
});
