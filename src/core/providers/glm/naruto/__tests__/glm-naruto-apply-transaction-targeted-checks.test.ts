import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createPatchEnvelope } from '../glm-naruto-patch-envelope.js';
import { runGlmNarutoApplyTransaction } from '../glm-naruto-apply-transaction.js';

async function tempRepo() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-glm-apply-targeted-'));
  await fsp.writeFile(path.join(root, 'a.js'), 'const value = 1;\n', 'utf8');
  spawnSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: root });
  spawnSync('git', ['add', '.'], { cwd: root });
  spawnSync('git', ['commit', '-m', 'init'], { cwd: root, stdio: 'ignore' });
  return root;
}

test('apply transaction rolls back when targeted checks fail', async () => {
  const cwd = await tempRepo();
  const artifactDir = path.join(cwd, '.sneakoscope', 'glm-naruto', 'M-test');
  const patch = `diff --git a/a.js b/a.js
--- a/a.js
+++ b/a.js
@@ -1 +1 @@
-const value = 1;
+const value = ;
`;
  const envelope = createPatchEnvelope({ missionId: 'M-test', workerId: 'w1', shardId: 's1', baseDigest: 'base', patch, strategy: 'minimal_patch', reasoningEffort: 'low', status: 'gate_passed' });
  const result = await runGlmNarutoApplyTransaction({ cwd, missionId: 'M-test', envelopes: [envelope], selectedPatchIds: ['w1'], artifactDir });
  assert.equal(result.ok, false);
  assert.equal(result.transaction.apply_passed, true);
  assert.equal(result.transaction.targeted_checks_passed, false);
  assert.equal(result.transaction.rollback_attempted, true);
  assert.equal(result.transaction.rollback_passed, true);
  assert.equal(result.transaction.final_status, 'rolled_back');
  assert.equal(await fsp.readFile(path.join(cwd, 'a.js'), 'utf8'), 'const value = 1;\n');
});
