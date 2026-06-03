#!/usr/bin/env node
// @ts-nocheck
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const result = spawnSync(process.execPath, [path.join(root, 'dist/bin/sks.js'), 'image-ux-review', 'fixture', '--mock', '--json'], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, SKS_SKIP_NPM_FRESHNESS_CHECK: '1', CI: 'true' },
  timeout: Number(process.env.SKS_UX_REVIEW_REAL_LOOP_FIXTURE_TIMEOUT_MS || 180_000)
});
assert.equal(result.status, 0, JSON.stringify({
  stderr: result.stderr,
  stdout: result.stdout,
  signal: result.signal,
  error: result.error?.message || null
}, null, 2));
const json = JSON.parse(result.stdout);
assert.equal(json.artifacts.gate.mock_fixture_cannot_claim_real, true);
assert.equal(json.artifacts.generated_review_ledger.real_generated_count, 0);
assert.equal(json.artifacts.generated_review_ledger.generated_count, 1);

console.log(JSON.stringify({ schema: 'sks.ux-review-real-loop-fixture.v1', ok: true, mission_id: json.mission_id }, null, 2));
