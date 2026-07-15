import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('update status, update check, and update-check expose the same v3 schema', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-update-cli-v3-'));
  try {
    const env = {
      ...process.env,
      HOME: home,
      SKS_GLOBAL_ROOT: path.join(home, '.sneakoscope-global'),
      SKS_UPDATE_STATUS_PATH: path.join(home, 'update-status.json'),
      SKS_DISABLE_UPDATE_CHECK: '1'
    };
    const commands = [
      ['update', 'status', '--refresh', '--json'],
      ['update', 'check', '--json'],
      ['update-check', '--json']
    ];
    for (const args of commands) {
      const run = spawnSync(process.execPath, ['dist/bin/sks.js', ...args], {
        cwd: process.cwd(), env, encoding: 'utf8'
      });
      assert.equal(run.status, 0, `${args.join(' ')}: ${run.stderr || run.stdout}`);
      const value = JSON.parse(run.stdout);
      assert.equal(value.schema, 'sks.update-status.v3');
      assert.equal(typeof value.update_count, 'number');
      assert.ok(value.sks && value.codex_cli && value.menubar);
    }
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
});
