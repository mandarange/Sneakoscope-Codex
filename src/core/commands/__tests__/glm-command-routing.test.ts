import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { glmCommand } from '../glm-command.js';

test('bare GLM command returns readiness/status and does not launch direct run', async () => {
  const previous = process.exitCode;
  const previousHome = process.env.SKS_HOME;
  process.env.SKS_HOME = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-glm-route-'));
  process.exitCode = undefined;
  const result = await glmCommand(['--json', '--skip-validation']);
  assert.equal((result as any).schema, 'sks.glm-mode-result.v1');
  assert.notEqual((result as any).schema, 'sks.glm-direct-run-result.v1');
  if (previousHome === undefined) delete process.env.SKS_HOME;
  else process.env.SKS_HOME = previousHome;
  process.exitCode = previous;
});

test('GLM task routes to bounded direct run and blocks without key instead of launching Zellij', async () => {
  const previousExit = process.exitCode;
  const previousOpenRouter = process.env.OPENROUTER_API_KEY;
  const previousSksOpenRouter = process.env.SKS_OPENROUTER_API_KEY;
  const previousHome = process.env.SKS_HOME;
  process.exitCode = undefined;
  process.env.SKS_HOME = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-glm-route-'));
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.SKS_OPENROUTER_API_KEY;
  const result = await glmCommand(['--json', 'run', 'fix src/a.ts']);
  assert.equal((result as any).schema, 'sks.glm-direct-run-result.v1');
  assert.equal((result as any).status, 'blocked');
  assert.deepEqual((result as any).blockers, ['glm_missing_openrouter_key']);
  if (previousOpenRouter === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = previousOpenRouter;
  if (previousSksOpenRouter === undefined) delete process.env.SKS_OPENROUTER_API_KEY;
  else process.env.SKS_OPENROUTER_API_KEY = previousSksOpenRouter;
  if (previousHome === undefined) delete process.env.SKS_HOME;
  else process.env.SKS_HOME = previousHome;
  process.exitCode = previousExit;
});
