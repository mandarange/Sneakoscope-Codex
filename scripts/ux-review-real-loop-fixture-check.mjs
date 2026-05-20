#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const result = spawnSync(process.execPath, [path.join(root, 'dist/bin/sks.js'), 'image-ux-review', 'fixture', '--mock', '--json'], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, SKS_SKIP_NPM_FRESHNESS_CHECK: '1', CI: 'true' },
  timeout: 60_000
});
assert.equal(result.status, 0, result.stderr || result.stdout);
const json = JSON.parse(result.stdout);
assert.equal(json.artifacts.gate.mock_fixture_cannot_claim_real, true);
assert.equal(json.artifacts.generated_review_ledger.real_generated_count, 0);
assert.equal(json.artifacts.generated_review_ledger.generated_count, 1);

console.log(JSON.stringify({ schema: 'sks.ux-review-real-loop-fixture.v1', ok: true, mission_id: json.mission_id }, null, 2));
