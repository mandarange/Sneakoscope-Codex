import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createPatchEnvelope } from '../glm-naruto-patch-envelope.js';
import { runGlmNarutoApplyTransaction } from '../glm-naruto-apply-transaction.js';

async function tempRepo() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-glm-apply-tx-'));
  await fsp.mkdir(path.join(root, 'src'), { recursive: true });
  await fsp.writeFile(path.join(root, 'src', 'a.ts'), 'export const a = 1;\n', 'utf8');
  spawnSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: root });
  spawnSync('git', ['add', '.'], { cwd: root });
  spawnSync('git', ['commit', '-m', 'init'], { cwd: root, stdio: 'ignore' });
  return root;
}

test('apply transaction writes patch and transaction evidence', async () => {
  const cwd = await tempRepo();
  const artifactDir = path.join(cwd, '.sneakoscope', 'glm-naruto', 'M-test');
  const patch = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1 @@
-export const a = 1;
+export const a = 2;
`;
  const envelope = createPatchEnvelope({ missionId: 'M-test', workerId: 'w1', shardId: 's1', baseDigest: 'base', patch, strategy: 'minimal_patch', reasoningEffort: 'low', status: 'gate_passed' });
  const result = await runGlmNarutoApplyTransaction({ cwd, missionId: 'M-test', envelopes: [envelope], selectedPatchIds: ['w1'], artifactDir });
  assert.equal(result.ok, true);
  assert.equal(result.transaction.apply_check_passed, true);
  assert.equal(result.transaction.final_status, 'applied');
  assert.equal((await fsp.readFile(path.join(cwd, 'src', 'a.ts'), 'utf8')).includes('2'), true);
  assert.equal(await exists(path.join(artifactDir, 'apply-transaction.json')), true);
  assert.equal(await exists(path.join(artifactDir, 'selected-combined.patch')), true);
});

async function exists(file: string): Promise<boolean> {
  try {
    await fsp.access(file);
    return true;
  } catch {
    return false;
  }
}
