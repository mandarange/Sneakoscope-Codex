import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createPatchEnvelope } from '../glm-naruto-patch-envelope.js';
import { checkAndApplyCombinedGlmNarutoPatch, combineGlmNarutoPatches } from '../glm-naruto-combined-patch.js';

async function tempRepo() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-glm-combined-'));
  await fsp.mkdir(path.join(root, 'src'), { recursive: true });
  await fsp.writeFile(path.join(root, 'src', 'a.ts'), 'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\n', 'utf8');
  spawnSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  return root;
}

function env(workerId: string, patch: string) {
  return createPatchEnvelope({ missionId: 'M-test', workerId, shardId: workerId, baseDigest: 'base', patch, strategy: 'minimal_patch', reasoningEffort: 'low', status: 'gate_passed' });
}

test('combined patch apply check runs before apply', async () => {
  const cwd = await tempRepo();
  const p1 = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,3 @@
-one
+ONE
 two
 three
`;
  const p2 = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -8,3 +8,3 @@
 eight
 nine
-ten
+TEN
`;
  const envelopes = [env('w2', p2), env('w1', p1)];
  const combined = combineGlmNarutoPatches(envelopes, ['w2', 'w1']);
  assert.ok(combined.indexOf('ONE') < combined.indexOf('TEN'));
  const checked = await checkAndApplyCombinedGlmNarutoPatch({ cwd, envelopes, selectedPatchIds: ['w2', 'w1'], apply: false });
  assert.equal(checked.ok, true);
  assert.equal(await fsp.readFile(path.join(cwd, 'src', 'a.ts'), 'utf8'), 'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\n');
});
