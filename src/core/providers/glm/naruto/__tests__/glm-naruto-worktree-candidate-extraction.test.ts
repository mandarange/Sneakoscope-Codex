import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { sha256 } from '../../../../fsx.js';
import { createPatchEnvelope } from '../glm-naruto-patch-envelope.js';
import { materializePatchViaWorktree } from '../glm-naruto-worktree-worker.js';

async function tempRepo() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-glm-worktree-candidate-'));
  await fsp.mkdir(path.join(root, 'src'), { recursive: true });
  await fsp.writeFile(path.join(root, 'src', 'a.ts'), 'export const a = 1;\n', 'utf8');
  spawnSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: root });
  spawnSync('git', ['add', '.'], { cwd: root });
  spawnSync('git', ['commit', '-m', 'init'], { cwd: root, stdio: 'ignore' });
  return root;
}

function candidateBody() {
  return `<sks_patch_candidate>
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
}

function envelope(patch: string) {
  return createPatchEnvelope({
    missionId: 'M-test',
    workerId: 'worker-1',
    shardId: 's1',
    baseDigest: 'base',
    patch,
    strategy: 'minimal_patch',
    reasoningEffort: 'low',
    status: 'gate_passed'
  });
}

test('worktree applies only extracted diff from patch candidate body', async () => {
  const cwd = await tempRepo();
  const body = candidateBody();
  const result = await materializePatchViaWorktree({ repoRoot: cwd, missionId: 'M-test', envelope: envelope(body), cleanup: true });
  assert.equal(result.ok, true);
  assert.equal(result.envelope.patch.includes('summary:'), false);
  assert.equal(result.envelope.patch.includes('target_paths:'), false);
  assert.equal(result.envelope.patch.includes('+export const a = 2;'), true);
  assert.equal(await fsp.readFile(path.join(cwd, 'src', 'a.ts'), 'utf8'), 'export const a = 1;\n');
});

test('worktree metadata records candidate and extracted patch hashes', async () => {
  const cwd = await tempRepo();
  const body = candidateBody();
  const result = await materializePatchViaWorktree({ repoRoot: cwd, missionId: 'M-test', envelope: envelope(body), cleanup: true });
  assert.equal(result.worktree?.candidate_body_sha256, sha256(body));
  assert.equal(typeof result.worktree?.extracted_patch_sha256, 'string');
  assert.equal(result.worktree?.applied_patch_was_extracted, true);
});

test('legacy sks patch body is rejected in worktree path', async () => {
  const cwd = await tempRepo();
  const result = await materializePatchViaWorktree({ repoRoot: cwd, missionId: 'M-test', envelope: envelope('<sks_patch>\ndiff --git a/src/a.ts b/src/a.ts\n</sks_patch>'), cleanup: true });
  assert.equal(result.ok, false);
  assert.equal(result.envelope.status, 'gate_failed');
  assert.ok(result.blockers.includes('legacy_sks_patch_envelope_rejected'));
});

test('malformed candidate body returns gate_failed without throwing', async () => {
  const cwd = await tempRepo();
  const result = await materializePatchViaWorktree({ repoRoot: cwd, missionId: 'M-test', envelope: envelope('<sks_patch_candidate>\nsummary: nope\n</sks_patch_candidate>'), cleanup: true });
  assert.equal(result.ok, false);
  assert.equal(result.envelope.status, 'gate_failed');
  assert.ok(result.blockers.includes('missing_patch_section'));
});
