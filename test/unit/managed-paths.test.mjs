import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { managedPathManifest } from '../../dist/core/managed-paths.js';

test('managed path manifest records SKS-owned rollback boundaries', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-managed-paths-'));
  const manifest = await managedPathManifest(root);
  assert.equal(manifest.schema, 'sks.managed-paths.v2');
  assert.ok(manifest.paths.some((row) => row.path === '.sneakoscope/missions' && row.rollback === true));
  assert.ok(manifest.paths.some((row) => row.path === '.sneakoscope/wiki/records' && row.rollback === false));
});
