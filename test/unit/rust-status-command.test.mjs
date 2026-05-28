import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { rustInfo } from '../../dist/core/rust-accelerator.js';
import { rustCommand } from '../../dist/core/commands/rust-command.js';

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

test('rust status reports version mismatch for stale native binary fixture', async () => {
  const previous = process.env.SKS_RS_BIN;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-rs-version-mismatch-'));
  const bin = path.join(dir, 'sks-rs');
  await fs.writeFile(bin, '#!/bin/sh\necho "sks-rs 0.0.0"\n', 'utf8');
  await fs.chmod(bin, 0o755);
  process.env.SKS_RS_BIN = bin;
  try {
    const info = await rustInfo();
    assert.equal(info.available, false);
    assert.equal(info.mode, 'js_fallback');
    assert.equal(info.status, 'version_mismatch');
    assert.equal(info.version, 'sks-rs 0.0.0');
    assert.match(info.error, /does not match package/);
  } finally {
    if (previous === undefined) delete process.env.SKS_RS_BIN;
    else process.env.SKS_RS_BIN = previous;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
