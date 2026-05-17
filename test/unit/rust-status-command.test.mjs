import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { rustInfo } from '../../src/core/rust-accelerator.mjs';
import { rustCommand } from '../../src/core/commands/rust-command.mjs';

test('rust status reports JS fallback as a supported optional mode', async () => {
  const previous = process.env.SKS_RS_BIN;
  process.env.SKS_RS_BIN = path.join(process.cwd(), 'missing-sks-rs');
  try {
    const info = await rustInfo();
    assert.equal(info.available, false);
    assert.equal(info.mode, 'js_fallback');
    assert.equal(info.prebuilt_available, false);
    assert.equal(info.source_included, true);
    assert.ok(info.capabilities.includes('voxel-validate'));
  } finally {
    if (previous === undefined) delete process.env.SKS_RS_BIN;
    else process.env.SKS_RS_BIN = previous;
  }
});

test('rust smoke command passes through JS fallback when native binary is absent', async () => {
  const previous = process.env.SKS_RS_BIN;
  process.env.SKS_RS_BIN = path.join(process.cwd(), 'missing-sks-rs');
  try {
    const report = await rustCommand(['smoke', '--json']);
    assert.equal(report.ok, true);
    assert.equal(report.mode, 'js_fallback');
    assert.equal(report.results.every((row) => row.ok), true);
  } finally {
    if (previous === undefined) delete process.env.SKS_RS_BIN;
    else process.env.SKS_RS_BIN = previous;
  }
});
