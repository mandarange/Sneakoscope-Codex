import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { managedPathManifest, rollbackList } from '../../src/core/managed-paths.mjs';

test('managed path manifest records SKS-owned rollback boundaries', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-managed-paths-'));
  const manifest = await managedPathManifest(root);
  assert.equal(manifest.schema, 'sks.managed-paths.v1');
  assert.ok(manifest.paths.some((row) => row.path === '.sneakoscope' && row.rollback === true));
  const list = await rollbackList(root);
  assert.equal(list.schema, 'sks.rollback.v1');
  assert.ok(list.actions.some((row) => row.id === 'rollback-sneakoscope'));
});
