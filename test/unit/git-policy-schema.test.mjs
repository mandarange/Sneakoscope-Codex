import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultGitPolicy, defaultSharedMemoryManifest } from '../../dist/core/git-hygiene/git-policy.js';
import { validateGitPolicy, validateSharedMemoryManifest } from '../../dist/core/git-hygiene/validators.js';

test('git policy and shared memory manifest use tracked/ignored planes', () => {
  const policy = defaultGitPolicy('solo');
  assert.equal(validateGitPolicy(policy).ok, true);
  assert.ok(policy.shared_memory.track.includes('.sneakoscope/wiki/records/**/*.json'));
  assert.ok(policy.local_runtime.ignore.includes('.sneakoscope/missions/**'));

  const manifest = defaultSharedMemoryManifest(policy);
  assert.equal(validateSharedMemoryManifest(manifest).ok, true);
  assert.ok(manifest.shared_memory_plane.some((row) => row.path.includes('records/claims')));
  assert.ok(manifest.generated_indexes.every((row) => row.git === 'ignored'));
});
