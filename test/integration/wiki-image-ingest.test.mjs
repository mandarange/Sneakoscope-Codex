import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ingestImage } from '../../src/core/wiki-image/image-voxel-ledger.mjs';

const PNG_1X1 = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000150a0f53a0000000049454e44ae426082', 'hex');

test('wiki image ingest records sha256 and dimensions', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-image-'));
  const file = path.join(root, 'screen.png');
  await fs.writeFile(file, PNG_1X1);
  const result = await ingestImage(root, file, { source: 'codex-computer-use' });
  assert.equal(result.image.width, 1);
  assert.equal(result.image.height, 1);
  assert.equal(result.image.sha256.length, 64);
});
