import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const cli = path.resolve('dist/bin/sks.js');

for (const [command, helpFlag] of [
  ['init', '--help'],
  ['setup', '-h'],
  ['bootstrap', '--help']
]) {
  test(`sks ${command} ${helpFlag} is side-effect free`, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `sks-${command}-help-`));
    const home = path.join(root, 'home');
    const project = path.join(root, 'project');
    fs.mkdirSync(home, { recursive: true });
    fs.mkdirSync(project, { recursive: true });

    const result = spawnSync(process.execPath, [cli, command, helpFlag], {
      cwd: project,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: home,
        CODEX_HOME: path.join(home, '.codex'),
        SKS_TEST_ISOLATION: '1'
      }
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, new RegExp(`Usage: sks ${command}\\b`));
    assert.equal(fs.existsSync(path.join(project, '.codex')), false);
    assert.equal(fs.existsSync(path.join(project, '.sneakoscope')), false);
    assert.equal(fs.existsSync(path.join(home, '.codex')), false);

    fs.rmSync(root, { recursive: true, force: true });
  });
}
