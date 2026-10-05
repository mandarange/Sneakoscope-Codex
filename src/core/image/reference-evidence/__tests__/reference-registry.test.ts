import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { registerPathImageReference } from '../reference-registry.js';

async function fixture(t: test.TestContext) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-image-reference-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const image = path.join(root, 'screen.png');
  await fsp.writeFile(image, Buffer.from('png-fixture'));
  return { root, image };
}

test('symlink and out-of-root paths fail closed unless the external path is explicit', async (t) => {
  const setup = await fixture(t);
  const outsideRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-image-outside-'));
  t.after(() => fsp.rm(outsideRoot, { recursive: true, force: true }));
  const outside = path.join(outsideRoot, 'outside.png');
  await fsp.writeFile(outside, Buffer.from('outside'));
  await assert.rejects(() => registerPathImageReference({ id: 'outside', filePath: outside, allowedRoots: [setup.root] }), /out_of_root/);
  assert.equal((await registerPathImageReference({ id: 'outside', filePath: outside, allowedRoots: [setup.root], allowOutOfRoot: true })).scope, 'external-explicit');
  const symlink = path.join(setup.root, 'link.png');
  await fsp.symlink(outside, symlink);
  await assert.rejects(() => registerPathImageReference({ id: 'link', filePath: symlink, allowedRoots: [setup.root], allowOutOfRoot: true }), /symlink_forbidden/);
});

