import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runGlmBenchmark } from '../bench/glm-benchmark-runner.js';

test('GLM benchmark is dry-run by default and does not require GPT or API key', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-glm-bench-'));
  const result = await runGlmBenchmark(root, []);
  assert.equal(result.status, 'dry_run');
  assert.equal(result.gpt_fallback_allowed, false);
  assert.equal(result.model, 'z-ai/glm-5.2');
  assert.equal(result.cases.length, 0);
  assert.equal(result.comparison.recommendation, 'inconclusive');
});

test('GLM benchmark execute without live is blocked', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-glm-bench-'));
  const result = await runGlmBenchmark(root, ['--execute']);
  assert.equal(result.status, 'blocked');
  assert.equal(result.cases.length, 0);
  assert.equal(result.gpt_fallback_allowed, false);
});
