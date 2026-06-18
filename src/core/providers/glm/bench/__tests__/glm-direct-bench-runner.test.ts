import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runGlmDirectBenchCase } from '../glm-direct-bench-runner.js';
import type { GlmDirectRunResult } from '../../glm-direct-run.js';
import type { GlmBenchFixture, GlmDirectBenchInput } from '../glm-benchmark-types.js';

function makeFixture(dir: string): GlmBenchFixture {
  return {
    schema: 'sks.glm-bench-fixture.v1',
    fixture_dir: dir,
    task: 'Change src/bench-target.ts so value is 2.',
    target_file: 'src/bench-target.ts',
    initial_content: 'export const value = 1;\n',
    expected_content: 'export const value = 2;\n'
  };
}

test('direct bench runner produces direct-glm case with not_applicable candidate metrics', async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-direct-bench-'));
  const caseDir = path.join(tmpRoot, 'cases', 'direct-glm-speed');
  const fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-direct-fixture-'));
  const fixture = makeFixture(fixtureDir);
  const mockResult: GlmDirectRunResult = {
    schema: 'sks.glm-direct-run-result.v1',
    ok: true,
    status: 'completed',
    run_id: 'direct-test',
    task: fixture.task,
    model: 'z-ai/glm-5.2',
    gpt_fallback_allowed: false,
    termination_reason: 'completed_noop',
    touched_paths: [],
    blockers: [],
    warnings: []
  };

  const input: GlmDirectBenchInput = {
    root: tmpRoot,
    fixture,
    apiKey: 'test-key',
    noApply: true,
    timeoutMs: 60_000,
    sessionId: 'test-session',
    caseDir
  };

  const result = await runGlmDirectBenchCase(input, {
    runDirect: async () => mockResult
  });

  assert.equal(result.schema, 'sks.glm-benchmark-case.v1');
  assert.equal(result.kind, 'direct-glm');
  assert.equal(result.runner_id, 'direct-glm-speed');
  assert.equal(result.implementation_path, 'direct-glm');
  assert.equal(result.workers, 1);
  assert.equal(result.candidate_count, null);
  assert.equal(result.gate_pass_rate, null);
  assert.equal(result.verifier_pass_rate, null);
  assert.equal(result.merge_success, null);
  assert.equal(result.metric_status.candidate, 'not_applicable');
  assert.equal(result.metric_status.verifier, 'not_applicable');
  assert.equal(result.metric_status.merge, 'not_applicable');
  assert.equal(result.no_apply, true);
  assert.equal(result.mutation_performed, false);
  assert.equal(result.gpt_fallback_allowed, false);
  assert.equal(result.model, 'z-ai/glm-5.2');
});

test('direct bench runner writes trace.json and case-result.json', async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-direct-bench-'));
  const caseDir = path.join(tmpRoot, 'cases', 'direct-glm-speed');
  const fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-direct-fixture-'));
  const fixture = makeFixture(fixtureDir);
  const mockResult: GlmDirectRunResult = {
    schema: 'sks.glm-direct-run-result.v1',
    ok: true,
    status: 'completed',
    run_id: 'direct-test',
    task: fixture.task,
    model: 'z-ai/glm-5.2',
    gpt_fallback_allowed: false,
    termination_reason: 'completed_noop',
    touched_paths: [],
    blockers: [],
    warnings: []
  };

  await runGlmDirectBenchCase(
    {
      root: tmpRoot,
      fixture,
      apiKey: 'test-key',
      noApply: true,
      timeoutMs: 60_000,
      sessionId: 'test-session',
      caseDir
    },
    { runDirect: async () => mockResult }
  );

  const trace = JSON.parse(await fs.readFile(path.join(caseDir, 'trace.json'), 'utf8'));
  assert.equal(trace.called_naruto, false);
  assert.equal(trace.implementation_path, 'direct-glm');
  const caseResult = JSON.parse(await fs.readFile(path.join(caseDir, 'case-result.json'), 'utf8'));
  assert.equal(caseResult.runner_id, 'direct-glm-speed');
});
