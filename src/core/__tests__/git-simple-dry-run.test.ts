import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { simpleGitCommitCommand } from '../git-simple.js';

// `sks commit --dry-run` used to ignore the flag and create a real commit.
test('commit --dry-run reports the plan without staging or committing', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-commit-dry-run-'));
  const priorCwd = process.cwd();
  const priorExit = process.exitCode;
  const priorLog = console.log;
  const output: string[] = [];
  try {
    const git = (args: string[]) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    git(['init', '-q']);
    git(['config', 'user.email', 'test@example.com']);
    git(['config', 'user.name', 'Test']);
    await fs.writeFile(path.join(root, 'a.txt'), 'a\n');
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'init']);
    const head = git(['rev-parse', 'HEAD']).stdout.trim();
    await fs.writeFile(path.join(root, 'b.txt'), 'b\n');
    process.chdir(root);
    console.log = (value: unknown) => { output.push(String(value)); };

    await simpleGitCommitCommand(['--dry-run', '--json']);
    const plan = JSON.parse(output.pop()!);
    assert.equal(plan.ok, true);
    assert.equal(plan.dry_run, true);
    assert.equal(plan.pushed, false);
    assert.deepEqual(plan.changed, ['?? b.txt']);
    assert.equal(git(['rev-parse', 'HEAD']).stdout.trim(), head, 'no commit may be created');
    assert.equal(git(['diff', '--cached', '--name-only']).stdout.trim(), '', 'nothing may be staged');
  } finally {
    console.log = priorLog;
    process.exitCode = priorExit;
    process.chdir(priorCwd);
    await fs.rm(root, { recursive: true, force: true });
  }
});
