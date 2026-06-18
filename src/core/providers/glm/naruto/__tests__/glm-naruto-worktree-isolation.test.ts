import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createPatchEnvelope } from '../glm-naruto-patch-envelope.js';
import { resolveGlmNarutoIsolationPolicy } from '../glm-naruto-isolation-policy.js';
import { materializePatchViaWorktree } from '../glm-naruto-worktree-worker.js';
import { removeGlmNarutoWorkerWorktree } from '../glm-naruto-worktree-manager.js';

async function tempRepo() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-glm-worktree-'));
  await fsp.mkdir(path.join(root, 'src'), { recursive: true });
  await fsp.writeFile(path.join(root, 'src', 'a.ts'), 'export const a = 1;\n', 'utf8');
  spawnSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: root });
  spawnSync('git', ['add', '.'], { cwd: root });
  spawnSync('git', ['commit', '-m', 'init'], { cwd: root, stdio: 'ignore' });
  return root;
}

test('worktree policy blocks unavailable git worktree unless fallback is explicit', () => {
  const blocked = resolveGlmNarutoIsolationPolicy({ useWorktree: true, gitAvailable: false });
  assert.equal(blocked.selected, 'blocked');
  assert.ok(blocked.blockers.includes('glm_naruto_worktree_not_implemented_or_unavailable'));

  const fallback = resolveGlmNarutoIsolationPolicy({ useWorktree: true, gitAvailable: false, fallbackAllowed: true });
  assert.equal(fallback.selected, 'patch-envelope-only');
});

test('worktree materialization applies patch outside main workspace and exports diff', async () => {
  const cwd = await tempRepo();
  const patch = `<sks_patch_candidate>
summary: update a
target_paths:
- src/a.ts
patch:
diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1 +1 @@
-export const a = 1;
+export const a = 2;
</sks_patch_candidate>`;
  const envelope = createPatchEnvelope({ missionId: 'M-test', workerId: 'worker-1', shardId: 's1', baseDigest: 'base', patch, strategy: 'minimal_patch', reasoningEffort: 'low', status: 'gate_passed' });
  const result = await materializePatchViaWorktree({ repoRoot: cwd, missionId: 'M-test', envelope, cleanup: false });
  assert.equal(result.ok, true);
  assert.ok(result.lease?.path);
  assert.equal((await fsp.readFile(path.join(cwd, 'src', 'a.ts'), 'utf8')).includes('1'), true);
  assert.equal(result.envelope.patch.includes('+export const a = 2;'), true);
  if (result.lease) await removeGlmNarutoWorkerWorktree(cwd, result.lease);
});
