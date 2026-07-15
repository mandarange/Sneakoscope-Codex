import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  ManagedPathSafetyError,
  ensureConfinedDirectory,
  inspectConfinedPath,
  moveConfinedPath,
  removeManagedPathVerified,
  walkConfinedEntries
} from '../managed-path-safety.js';

test('managed path inspection refuses ancestor symlinks and does not traverse the outside target', async () => {
  const boundary = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-managed-path-boundary-'));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-managed-path-outside-'));
  try {
    const outsideFile = path.join(outside, 'proof.txt');
    const bytes = Buffer.from('outside-target-must-not-change\n');
    await fs.writeFile(outsideFile, bytes);
    await fs.symlink(outside, path.join(boundary, 'linked'));

    await assert.rejects(
      inspectConfinedPath(boundary, path.join(boundary, 'linked', 'proof.txt')),
      (error: unknown) => error instanceof ManagedPathSafetyError && error.code === 'managed_path_ancestor_symlink_refused'
    );
    await assert.rejects(
      ensureConfinedDirectory(boundary, path.join(boundary, 'linked', 'nested')),
      (error: unknown) => error instanceof ManagedPathSafetyError && error.code === 'managed_path_directory_symlink_refused'
    );
    assert.deepEqual(await fs.readFile(outsideFile), bytes);
  } finally {
    await fs.rm(boundary, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
});

test('managed path move quarantines a leaf symlink itself while verified removal refuses it', async () => {
  const boundary = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-managed-path-leaf-'));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-managed-path-leaf-outside-'));
  try {
    const target = path.join(outside, 'customer.txt');
    const source = path.join(boundary, 'retired-link');
    const destination = path.join(boundary, 'quarantine', 'retired-link');
    const bytes = Buffer.from('customer-bytes\n');
    await fs.writeFile(target, bytes);
    await fs.symlink(target, source);

    const inspected = await inspectConfinedPath(boundary, source);
    assert.equal(inspected.leafSymlink, true);
    await assert.rejects(
      removeManagedPathVerified(boundary, source),
      (error: unknown) => error instanceof ManagedPathSafetyError && error.code === 'managed_path_leaf_symlink_refused'
    );
    await moveConfinedPath(boundary, source, destination);
    await assert.rejects(fs.lstat(source));
    assert.equal((await fs.lstat(destination)).isSymbolicLink(), true);
    assert.deepEqual(await fs.readFile(target), bytes);
  } finally {
    await fs.rm(boundary, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
});

test('confined walk reports symlink leaves without following them and verified removal deletes regular trees', async () => {
  const boundary = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-managed-path-walk-'));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-managed-path-walk-outside-'));
  try {
    const tree = path.join(boundary, 'tree');
    const regular = path.join(tree, 'nested', 'managed.json');
    const linked = path.join(tree, 'outside-link');
    const outsideFile = path.join(outside, 'outside.json');
    const outsideBytes = Buffer.from('{"outside":true}\n');
    await fs.mkdir(path.dirname(regular), { recursive: true });
    await fs.writeFile(regular, '{"managed":true}\n');
    await fs.writeFile(outsideFile, outsideBytes);
    await fs.symlink(outside, linked);

    const walk = await walkConfinedEntries(boundary, tree);
    assert.deepEqual(walk.errors, []);
    assert.deepEqual(walk.entries.sort(), [regular, linked].sort());
    await fs.unlink(linked);
    await removeManagedPathVerified(boundary, tree);
    await assert.rejects(fs.access(tree));
    assert.deepEqual(await fs.readFile(outsideFile), outsideBytes);
  } finally {
    await fs.rm(boundary, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
});
