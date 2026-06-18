import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runGlmBench } from '../glm-bench.js';

test('GLM bench is dry-run by default and does not require GPT', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-glm-bench-'));
  const result = await runGlmBench(root, []);
  assert.equal(result.status, 'dry_run');
  assert.equal(result.dry_run, true);
  assert.equal(result.cases.length, 4);
  assert.equal(typeof result.summary.deep_p50_total_ms, 'number');
  assert.equal(result.summary.gpt_p50_total_ms, undefined);
});

test('GLM bench execute is blocked until live OpenRouter measurement exists', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-glm-bench-'));
  const result = await runGlmBench(root, ['--execute']);
  assert.equal(result.status, 'blocked');
  assert.equal(result.dry_run, true);
  assert.equal(result.cases.length, 0);
  await assert.rejects(fs.stat(path.join(root, '.sneakoscope', 'glm', 'bench-result.json')));
  assert.equal((await fs.stat(path.join(root, '.sneakoscope', 'glm', 'bench-blocked.json'))).isFile(), true);
});
