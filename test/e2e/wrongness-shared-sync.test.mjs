import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createHermeticProjectRoot, runSksInRoot } from './route-real-command-helper.mjs';
import { runProcess } from '../../dist/core/fsx.js';

test('shared wrongness shards are read when the local project ledger is absent', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'wrongness-shared-sync', setup: false });
  await runProcess('git', ['init'], { cwd: root });
  await runSksInRoot(root, ['git', 'install', '--json']);
  await runSksInRoot(root, ['wrongness', 'add', '--claim', 'Shared wrongness survives local ledger loss.', '--avoid', 'Read shared wrongness before final claims.', '--json']);
  const publish = await runSksInRoot(root, ['wrongness', 'publish', 'latest', '--shared', '--json']);
  assert.equal(publish.ok, true);
  await fs.rm(path.join(root, '.sneakoscope', 'wiki', 'wrongness-ledger.json'), { force: true });
  const list = await runSksInRoot(root, ['wrongness', 'list', 'project', '--json']);
  assert.ok(list.records.some((record) => record.claim.text.includes('Shared wrongness survives')));
});

test('local wrongness resolution overrides an older shared shard', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'wrongness-shared-resolve', setup: false });
  await runProcess('git', ['init'], { cwd: root });
  await runSksInRoot(root, ['git', 'install', '--json']);
  const added = await runSksInRoot(root, ['wrongness', 'add', '--claim', 'Shared wrongness can be corrected.', '--json']);
  const id = added.record.id;
  assert.equal((await runSksInRoot(root, ['wrongness', 'publish', 'latest', '--shared', '--json'])).ok, true);
  assert.equal((await runSksInRoot(root, ['wrongness', 'resolve', id, '--reason', 'Corrected in local ledger.', '--json'])).ok, true);
  assert.equal((await runSksInRoot(root, ['wrongness', 'publish', 'latest', '--shared', '--json'])).ok, true);
  const list = await runSksInRoot(root, ['wrongness', 'list', 'project', '--json']);
  assert.equal(list.records.find((record) => record.id === id)?.status, 'resolved');
});
