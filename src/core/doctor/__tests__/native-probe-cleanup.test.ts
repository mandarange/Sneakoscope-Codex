import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cleanupNativeCapabilityProbeArtifacts } from '../doctor-native-capability-repair.js';

test('native capability probe cleanup removes only exact disposable sentinels', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-native-probe-cleanup-'));
  try {
    const imageDir = path.join(root, '.sneakoscope', 'image-artifacts');
    const appDir = path.join(root, '.sneakoscope', 'app-screenshots');
    await fs.mkdir(imageDir, { recursive: true });
    await fs.mkdir(appDir, { recursive: true });
    const disposable = path.join(imageDir, 'postcheck-followup-sample.txt');
    const userOwned = path.join(appDir, 'postcheck-screenshot-sample.txt');
    await fs.writeFile(disposable, 'sks-native-capability-postcheck\n');
    await fs.writeFile(userOwned, 'user-owned-content\n');
    const result = await cleanupNativeCapabilityProbeArtifacts(root);
    assert.equal(result.ok, true);
    assert.equal(await fs.stat(disposable).then(() => true, () => false), false);
    assert.equal(await fs.readFile(userOwned, 'utf8'), 'user-owned-content\n');
    assert.ok(result.preserved_non_probe_files.includes(userOwned));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('native capability probe cleanup is read-only when apply is false', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-native-probe-cleanup-dry-'));
  try {
    const disposable = path.join(root, '.sneakoscope', 'image-artifacts', 'postcheck-followup-sample.txt');
    await fs.mkdir(path.dirname(disposable), { recursive: true });
    await fs.writeFile(disposable, 'sks-native-capability-postcheck\n');
    const result = await cleanupNativeCapabilityProbeArtifacts(root, { apply: false });
    assert.equal(result.apply, false);
    assert.deepEqual(result.removed, []);
    assert.deepEqual(result.planned, [disposable]);
    assert.equal(await fs.readFile(disposable, 'utf8'), 'sks-native-capability-postcheck\n');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
