import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkAndApplyGlmPatch } from '../glm-patch-apply.js';

test('GLM patch apply gate checks and applies a safe unified diff', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-glm-patch-'));
  spawnSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src/a.ts'), 'export const a = 1;\n');
  spawnSync('git', ['add', '.'], { cwd: root, stdio: 'ignore' });
  spawnSync('git', ['commit', '-m', 'init'], { cwd: root, stdio: 'ignore', env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com' } });
  const patch = [
    'diff --git a/src/a.ts b/src/a.ts',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -1 +1 @@',
    '-export const a = 1;',
    '+export const a = 2;',
    ''
  ].join('\n');
  const result = await checkAndApplyGlmPatch({ cwd: root, patch, apply: true });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value.touchedPaths, ['src/a.ts']);
  assert.equal(await fs.readFile(path.join(root, 'src/a.ts'), 'utf8'), 'export const a = 2;\n');
});

test('GLM patch apply blocks protected paths', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-glm-patch-'));
  const patch = 'diff --git a/.github/workflows/ci.yml b/.github/workflows/ci.yml\n';
  const result = await checkAndApplyGlmPatch({ cwd: root, patch, apply: false });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, 'glm_patch_protected_path');
});
