import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import test from 'node:test';

const cli = path.resolve('dist/bin/sks.js');

test('sks wrongness CLI can add, list, validate, and resolve records', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-wrongness-cli-'));
  const add = run(root, ['wrongness', 'add', '--kind', 'missing_evidence', '--claim', 'CLI fixture missed evidence', '--json']);
  assert.equal(add.status, 0, add.stderr);
  const added = JSON.parse(add.stdout);
  assert.equal(added.ok, true);

  const list = run(root, ['wrongness', 'list', '--json']);
  assert.equal(list.status, 0, list.stderr);
  assert.equal(JSON.parse(list.stdout).records.length, 1);

  const validate = run(root, ['wrongness', 'validate', 'project', '--json']);
  assert.equal(validate.status, 0, validate.stderr);
  assert.equal(JSON.parse(validate.stdout).ok, true);

  const resolved = run(root, ['wrongness', 'resolve', added.record.id, '--reason', 'CLI fixture resolved', '--json']);
  assert.equal(resolved.status, 0, resolved.stderr);
  assert.equal(JSON.parse(resolved.stdout).updated, 1);
});

function run(cwd, args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' }
  });
}
