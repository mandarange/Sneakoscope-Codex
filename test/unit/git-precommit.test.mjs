import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { runProcess } from '../../dist/core/fsx.js';
import { ensureGitPolicy } from '../../dist/core/git-hygiene/git-policy.js';
import { installGitignoreBlock } from '../../dist/core/git-hygiene/gitignore-writer.js';
import { gitPrecommit } from '../../dist/core/git-hygiene/git-precommit.js';

test('git precommit blocks staged local runtime noise', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-precommit-'));
  await runProcess('git', ['init'], { cwd: root });
  await ensureGitPolicy(root, { write: true });
  await installGitignoreBlock(root);
  await fs.mkdir(path.join(root, '.sneakoscope', 'missions'), { recursive: true });
  await fs.writeFile(path.join(root, '.sneakoscope', 'missions', 'runtime.json'), '{}\n');
  await runProcess('git', ['add', '-f', '.sneakoscope/missions/runtime.json'], { cwd: root });
  const report = await gitPrecommit(root);
  assert.equal(report.ok, false);
  assert.ok(report.blockers.includes('runtime_noise_not_staged'));
});

