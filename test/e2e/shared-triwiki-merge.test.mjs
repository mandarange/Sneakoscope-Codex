import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createHermeticProjectRoot, runSksInRoot } from './route-real-command-helper.mjs';
import { runProcess } from '../../dist/core/fsx.js';

test('shared TriWiki publish accumulates independent claim shards', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'shared-triwiki-merge', setup: false });
  await runProcess('git', ['init'], { cwd: root });
  await runSksInRoot(root, ['git', 'install', '--json']);
  await writeContextPack(root, [{ id: 'worker-a-claim', text: 'Worker A shared claim.', status: 'supported' }]);
  await runSksInRoot(root, ['wiki', 'publish', 'latest', '--shared', '--json']);
  await writeContextPack(root, [
    { id: 'worker-a-claim', text: 'Worker A shared claim.', status: 'supported' },
    { id: 'worker-b-claim', text: 'Worker B shared claim.', status: 'supported' }
  ]);
  const publish = await runSksInRoot(root, ['wiki', 'publish', 'latest', '--shared', '--json']);
  assert.equal(publish.ok, true);
  const files = await fs.readdir(path.join(root, '.sneakoscope', 'wiki', 'records', 'claims'));
  assert.ok(files.includes('worker-a-claim.json'));
  assert.ok(files.includes('worker-b-claim.json'));
  const validation = await runSksInRoot(root, ['wiki', 'validate-shared', '--json']);
  assert.equal(validation.ok, true);
});

async function writeContextPack(root, claims) {
  const file = path.join(root, '.sneakoscope', 'wiki', 'context-pack.json');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ schema: 'fixture', claims }, null, 2));
}

