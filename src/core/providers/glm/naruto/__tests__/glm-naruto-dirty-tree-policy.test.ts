import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createPatchEnvelope } from '../glm-naruto-patch-envelope.js';
import { runGlmNarutoApplyTransaction } from '../glm-naruto-apply-transaction.js';

async function tempRepo() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-glm-dirty-policy-'));
  await fsp.writeFile(path.join(root, 'a.js'), 'const value = 1;\n', 'utf8');
  spawnSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: root });
  spawnSync('git', ['add', '.'], { cwd: root });
  spawnSync('git', ['commit', '-m', 'init'], { cwd: root, stdio: 'ignore' });
  return root;
}

function patchEnvelope() {
  const patch = `diff --git a/a.js b/a.js
--- a/a.js
+++ b/a.js
@@ -1 +1 @@
-const value = 1;
+const value = 2;
`;
  return createPatchEnvelope({ missionId: 'M-test', workerId: 'w1', shardId: 's1', baseDigest: 'base', patch, strategy: 'minimal_patch', reasoningEffort: 'low', status: 'gate_passed' });
}

test('dirty touched paths block final apply by default', async () => {
  const cwd = await tempRepo();
  await fsp.writeFile(path.join(cwd, 'a.js'), 'const value = 1;\n// user edit\n', 'utf8');
  const artifactDir = path.join(cwd, '.sneakoscope', 'glm-naruto', 'M-test');
  const result = await runGlmNarutoApplyTransaction({ cwd, missionId: 'M-test', envelopes: [patchEnvelope()], selectedPatchIds: ['w1'], artifactDir });
  assert.equal(result.ok, false);
  assert.equal(result.transaction.dirty_policy, 'block');
  assert.deepEqual(result.transaction.dirty_touched_paths_before_apply, ['a.js']);
  assert.equal(result.transaction.apply_passed, false);
  assert.ok(result.transaction.blockers.some((blocker) => blocker.startsWith('dirty_touched_paths_before_apply')));
});

test('allow-dirty-apply opt-in records allow policy', async () => {
  const cwd = await tempRepo();
  const artifactDir = path.join(cwd, '.sneakoscope', 'glm-naruto', 'M-test');
  const result = await runGlmNarutoApplyTransaction({ cwd, missionId: 'M-test', envelopes: [patchEnvelope()], selectedPatchIds: ['w1'], artifactDir, allowDirtyApply: true });
  assert.equal(result.ok, true);
  assert.equal(result.transaction.dirty_policy, 'allow');
});
