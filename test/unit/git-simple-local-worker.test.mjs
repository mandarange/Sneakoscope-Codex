import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('simple git commit can use enabled local Ollama worker for message drafting only', async () => {
  const { simpleGitCommit } = await import('../../dist/core/git-simple.js');
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-simple-git-local-worker-'));
  runGit(cwd, ['init']);
  runGit(cwd, ['config', 'user.email', 'codex@example.test']);
  runGit(cwd, ['config', 'user.name', 'Codex Test']);
  await fs.writeFile(path.join(cwd, 'owned.txt'), 'hello\n');

  const old = snapshotEnv();
  const oldFetch = globalThis.fetch;
  process.env.SKS_OLLAMA_WORKERS = '1';
  process.env.SKS_LOCAL_MODEL_CONFIG = path.join(cwd, 'local-model.json');
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body || '{}'));
    assert.equal(body.stream, false);
    assert.equal(body.format, 'json');
    assert.match(body.prompt, /commit message draft only/);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        model: 'rafw007/qwen36-a3b-claude-coder:q4_K_M',
        done: true,
        response: JSON.stringify({
          summary: 'chore: exercise local simple git worker',
          findings: ['status lines were summarized locally'],
          proposed_changes: ['Add owned.txt']
        })
      })
    };
  };

  try {
    const result = await simpleGitCommit(cwd, { push: false });
    assert.equal(result.ok, true);
    assert.equal(result.local_worker.used, true);
    assert.equal(result.local_worker.parent_owned_git_mutation, true);
    assert.equal(runGit(cwd, ['status', '--short']).stdout.trim(), '');
    const message = runGit(cwd, ['log', '-1', '--pretty=%B']).stdout;
    assert.match(message, /^chore: exercise local simple git worker/m);
    assert.equal((message.match(/Co-authored-by: Codex <noreply@openai\.com>/g) || []).length, 1);
  } finally {
    globalThis.fetch = oldFetch;
    restoreEnv(old);
  }
});

function runGit(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

function snapshotEnv() {
  return {
    SKS_OLLAMA_WORKERS: process.env.SKS_OLLAMA_WORKERS,
    SKS_LOCAL_MODEL_CONFIG: process.env.SKS_LOCAL_MODEL_CONFIG
  };
}

function restoreEnv(old) {
  for (const [key, value] of Object.entries(old)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
