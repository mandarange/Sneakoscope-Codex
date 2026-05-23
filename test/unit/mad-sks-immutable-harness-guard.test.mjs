import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildProtectedCoreSnapshot,
  evaluateMadSksWrite,
  resolveProtectedCore
} from '../../dist/core/mad-sks/immutable-harness-guard.js';

test('MAD-SKS immutable harness guard blocks SKS core writes even inside target root', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-mad-core-'));
  await fs.mkdir(path.join(root, 'src', 'core'), { recursive: true });
  await fs.mkdir(path.join(root, 'scripts'), { recursive: true });
  await fs.mkdir(path.join(root, 'customer-app'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"sneakoscope","version":"1.15.0"}\n');
  await fs.writeFile(path.join(root, 'src', 'core', 'version.ts'), 'export const PACKAGE_VERSION = "1.15.0";\n');
  await fs.writeFile(path.join(root, 'customer-app', 'app.ts'), 'export const ok = true;\n');

  const core = await resolveProtectedCore({ packageRoot: root, targetRoot: root });
  assert.equal(core.schema, 'sks.mad-sks-protected-core.v1');
  assert.ok(core.protected_paths.some((entry) => entry.relative_path === 'package.json'));
  assert.ok(core.protected_paths.some((entry) => entry.relative_path === 'src/core'));

  const blocked = await evaluateMadSksWrite({
    packageRoot: root,
    targetRoot: root,
    operation: 'file_write',
    path: path.join(root, 'src', 'core', 'version.ts')
  });
  assert.equal(blocked.decision, 'blocked');
  assert.equal(blocked.reason, 'protected_core_path');

  const allowed = await evaluateMadSksWrite({
    packageRoot: root,
    targetRoot: root,
    operation: 'file_write',
    path: path.join(root, 'customer-app', 'app.ts')
  });
  assert.equal(allowed.decision, 'allowed');
});

test('MAD-SKS protected core snapshot records hashes before and after guarded work', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-mad-snapshot-'));
  await fs.mkdir(path.join(root, 'dist', 'bin'), { recursive: true });
  await fs.writeFile(path.join(root, 'dist', 'bin', 'sks.js'), '#!/usr/bin/env node\n');

  const snapshot = await buildProtectedCoreSnapshot({ packageRoot: root, label: 'before' });

  assert.equal(snapshot.schema, 'sks.mad-sks-protected-core-snapshot.v1');
  assert.equal(snapshot.label, 'before');
  assert.ok(snapshot.entries.some((entry) => entry.relative_path === 'dist/bin/sks.js'));
  assert.match(snapshot.snapshot_hash, /^[a-f0-9]{64}$/);
});
