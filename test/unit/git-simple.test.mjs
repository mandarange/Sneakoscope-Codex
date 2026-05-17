import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runProcess } from '../../src/core/fsx.mjs';
import { simpleGitCommit } from '../../src/core/git-simple.mjs';

test('simple git commit stages changes and appends Codex trailer once', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-simple-git-'));
  await runProcess('git', ['init'], { cwd: root });
  await runProcess('git', ['config', 'user.email', 'test@example.test'], { cwd: root });
  await runProcess('git', ['config', 'user.name', 'SKS Test'], { cwd: root });
  await fs.writeFile(path.join(root, 'file.txt'), 'hello\n', 'utf8');
  const result = await simpleGitCommit(root, { message: 'test: simple commit' });
  assert.equal(result.ok, true, result.reason || result.command?.stderr);
  const log = await runProcess('git', ['log', '-1', '--pretty=%B'], { cwd: root });
  const trailers = log.stdout.match(/Co-authored-by: Codex <noreply@openai\.com>/g) || [];
  assert.equal(trailers.length, 1);
});
