import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { exists } from '../../src/core/fsx.mjs';
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

    const invalid = await rustVoxelValidate(path.join(process.cwd(), 'test/fixtures/wiki-image/invalid-bbox-ledger.json'), { requireAnchors: true });
    assert.equal(invalid.engine, 'js');
    assert.equal(invalid.result.ok, false);
    assert.ok(invalid.result.issues.includes('bbox_width_out_of_bounds:bad-bbox'));
  } finally {
    if (previous === undefined) delete process.env.SKS_RS_BIN;
    else process.env.SKS_RS_BIN = previous;
  }
});

test('rust wrapper compares Rust and JS validator when SKS_RS_BIN is available', async () => {
  const explicit = process.env.SKS_RS_BIN;
  if (!explicit || !await exists(explicit)) {
    const fallback = await rustVoxelValidate(path.join(process.cwd(), 'test/fixtures/wiki-image/missing-image-ref-ledger.json'), { requireAnchors: true });
    assert.equal(fallback.engine, 'js');
    assert.equal(fallback.result.ok, false);
    assert.ok(fallback.result.issues.includes('anchor_image_ref:missing-ref'));
    return;
  }
  const previous = process.env.SKS_RS_BIN;
  try {
    process.env.SKS_RS_BIN = explicit;
    const rust = await rustVoxelValidate(path.join(process.cwd(), 'test/fixtures/wiki-image/valid-ledger.json'), { requireAnchors: true });
    const invalid = await rustVoxelValidate(path.join(process.cwd(), 'test/fixtures/wiki-image/missing-image-ref-ledger.json'), { requireAnchors: true });
    assert.equal(rust.result.ok, true);
    assert.equal(invalid.result.ok, false);
    assert.ok(invalid.result.issues.includes('anchor_image_ref:missing-ref'));
  } finally {
    process.env.SKS_RS_BIN = previous;
  }
});
