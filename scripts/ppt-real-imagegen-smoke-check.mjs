#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

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
const run = spawnSync(process.execPath, ['./dist/bin/sks.js', 'ppt', 'review', '--manual-slide-images', 'test/fixtures/images/one-by-one.png', '--json'], {
  cwd: process.cwd(),
  env: process.env,
  encoding: 'utf8',
  maxBuffer: 8 * 1024 * 1024
});
const result = {
  schema: 'sks.ppt-real-imagegen-smoke.v1',
  ok: run.status === 0,
  status: run.status === 0 ? 'passed' : 'blocked',
  fake_adapter: false,
  real_generated: run.status === 0,
  stdout_tail: run.stdout.slice(-4000),
  stderr_tail: run.stderr.slice(-4000)
};
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
