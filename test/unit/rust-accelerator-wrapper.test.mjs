import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { rustImageHash, rustVoxelValidate } from '../../src/core/rust-accelerator.mjs';

test('rust wrapper normalizes JS fallback parity shape', async () => {
  const previous = process.env.SKS_RS_BIN;
  process.env.SKS_RS_BIN = path.join(process.cwd(), 'missing-sks-rs');
  try {
    const hash = await rustImageHash(path.join(process.cwd(), 'test/fixtures/images/one-by-one.png'));
    assert.equal(hash.engine, 'js');
    assert.equal(hash.result.ok, true);
    assert.equal(hash.result.sha256.length, 64);

    const voxel = await rustVoxelValidate(path.join(process.cwd(), 'test/fixtures/wiki-image/valid-ledger.json'));
    assert.equal(voxel.engine, 'js');
    assert.equal(voxel.result.ok, true);
    assert.equal(voxel.result.anchors, 1);
  } finally {
    if (previous === undefined) delete process.env.SKS_RS_BIN;
    else process.env.SKS_RS_BIN = previous;
  }
});
