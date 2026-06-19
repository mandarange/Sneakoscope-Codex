import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { runGlmBenchmark } from '../glm-benchmark-runner.js';

function gitStatusClean(cwd: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn('git', ['status', '--short'], { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.on('data', (c) => { out += String(c); });
    child.on('close', () => resolve(out.trim()));
    child.on('error', () => resolve(''));
  });
}

function gitExec(args: string[], cwd: string): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    child.on('close', () => resolve());
  });
}

test('default live bench does not mutate user workspace source files', async () => {
  const prev = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'sk-or-test';
  const userCwd = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-user-cwd-'));
  await gitExec(['init', '-q'], userCwd);
  await fs.writeFile(path.join(userCwd, 'README.md'), '# test\n');
  await fs.writeFile(path.join(userCwd, 'src.ts'), 'export const x = 1;\n');
  await gitExec(['add', '.'], userCwd);
  await gitExec(['commit', '-q', '-m', 'init', '--config', 'user.name=test', '--config', 'user.email=test@test.com'], userCwd);
  await fs.writeFile(path.join(userCwd, '.gitignore'), '.sneakoscope/\n');
  await gitExec(['add', '.gitignore'], userCwd);
  await gitExec(['commit', '-q', '-m', 'gitignore', '--config', 'user.name=test', '--config', 'user.email=test@test.com'], userCwd);

  const beforeStatus = await gitStatusClean(userCwd);

  try {
    const origCwd = process.cwd();
    process.chdir(userCwd);
    try {
      const result = await runGlmBenchmark(userCwd, ['--live'], {
        runDirect: async (input) => ({
          schema: 'sks.glm-direct-run-result.v1', ok: true, status: 'completed', run_id: 'd',
          task: input.task, model: 'z-ai/glm-5.2', gpt_fallback_allowed: false,
          termination_reason: 'completed_noop', touched_paths: [], blockers: [], warnings: []
        }),
        runNaruto: async (input) => ({
          schema: 'sks.glm-naruto-mission-result.v1', ok: false, status: 'partial_candidates',
          mission_id: input.missionId ?? 'M', task: input.task, model: 'z-ai/glm-5.2',
          gpt_fallback_allowed: false, termination_reason: 'partial_no_apply',
          workers_started: input.maxWorkers ?? 0, workers_completed: 0,
          patch_candidates: 0, gate_passed_candidates: 0, mergeable_candidates: 0,
          applied_patches: 0, failed_shards: 0, repair_waves: 0, budget_used_ms: 0,
          blockers: [], warnings: []
        })
      });

      for (const c of result.cases) {
        assert.equal(c.mutation_performed, false);
        assert.equal(c.no_apply, true);
      }
      assert.ok(result.no_mutation_proof);
      assert.equal(result.no_mutation_proof.cases_report_no_mutation, true);
    } finally {
      process.chdir(origCwd);
    }

    const afterStatus = await gitStatusClean(userCwd);
    assert.equal(afterStatus, beforeStatus);
  } finally {
    if (prev === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = prev;
    await fs.rm(userCwd, { recursive: true, force: true });
  }
});

test('no mutation proof reports false when user cwd changes during benchmark', async () => {
  const prev = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'sk-or-test';
  const userCwd = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-user-cwd-mutated-'));
  await gitExec(['init', '-q'], userCwd);
  await fs.writeFile(path.join(userCwd, 'README.md'), '# test\n');
  await gitExec(['add', '.'], userCwd);
  await gitExec(['commit', '-q', '-m', 'init', '--config', 'user.name=test', '--config', 'user.email=test@test.com'], userCwd);

  try {
    const origCwd = process.cwd();
    process.chdir(userCwd);
    try {
      const result = await runGlmBenchmark(userCwd, ['--live'], {
        runDirect: async (input) => {
          await fs.writeFile(path.join(userCwd, 'mutated.txt'), input.task);
          return {
            schema: 'sks.glm-direct-run-result.v1', ok: true, status: 'completed', run_id: 'd',
            task: input.task, model: 'z-ai/glm-5.2', gpt_fallback_allowed: false,
            termination_reason: 'completed_noop', touched_paths: [], blockers: [], warnings: []
          };
        },
        runNaruto: async (input) => ({
          schema: 'sks.glm-naruto-mission-result.v1', ok: false, status: 'partial_candidates',
          mission_id: input.missionId ?? 'M', task: input.task, model: 'z-ai/glm-5.2',
          gpt_fallback_allowed: false, termination_reason: 'partial_no_apply',
          workers_started: input.maxWorkers ?? 0, workers_completed: 0,
          patch_candidates: 0, gate_passed_candidates: 0, mergeable_candidates: 0,
          applied_patches: 0, failed_shards: 0, repair_waves: 0, budget_used_ms: 0,
          blockers: [], warnings: []
        })
      });
      assert.ok(result.no_mutation_proof);
      assert.equal(result.no_mutation_proof.user_cwd_unchanged, false);
      assert.equal(result.no_mutation_proof.passed, false);
    } finally {
      process.chdir(origCwd);
    }
  } finally {
    if (prev === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = prev;
    await fs.rm(userCwd, { recursive: true, force: true });
  }
});
