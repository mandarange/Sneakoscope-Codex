#!/usr/bin/env node
// @ts-nocheck
import { spawnSync } from 'node:child_process';
import { osTempPngFixtureArg } from './lib/valid-png-fixture.js';

const enabled = process.env.SKS_TEST_REAL_IMAGEGEN === '1' || process.env.SKS_REAL_IMAGEGEN === '1';
const hasKey = Boolean(process.env.OPENAI_API_KEY || process.env.SKS_CODEX_APP_IMAGEGEN === '1');
if (!enabled || !hasKey) {
  const result = {
    schema: 'sks.ppt-real-imagegen-smoke.v1',
    ok: true,
    status: 'integration_optional',
    reason: !enabled ? 'SKS_TEST_REAL_IMAGEGEN=1 not set' : 'OPENAI_API_KEY or Codex App imagegen capability not configured',
    fake_adapter: false,
    real_generated: false
  };
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}
const sourceImage = osTempPngFixtureArg('ppt-real-imagegen-smoke-source.png');
const run = spawnSync(process.execPath, ['./dist/bin/sks.js', 'ppt', 'review', '--manual-slide-images', sourceImage, '--json'], {
  cwd: process.cwd(),
  env: process.env,
  encoding: 'utf8',
  timeout: Number(process.env.SKS_PPT_REAL_IMAGEGEN_SMOKE_TIMEOUT_MS || 180000),
  maxBuffer: 8 * 1024 * 1024
});
const result = {
  schema: 'sks.ppt-real-imagegen-smoke.v1',
  ok: run.status === 0,
  status: run.status === 0 ? 'passed' : 'blocked',
  fake_adapter: false,
  source_image: sourceImage,
  real_generated: run.status === 0,
  process_error: run.error?.message || null,
  process_signal: run.signal || null,
  stdout_tail: run.stdout.slice(-4000),
  stderr_tail: run.stderr.slice(-4000)
};
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
