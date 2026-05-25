import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../dist/core/fsx.js';

test('packed Codex compatibility includes schema snapshot and semantic status', async () => {
  const result = await runProcess(process.execPath, ['./dist/bin/sks.js', 'codex', 'compatibility', '--json'], {
    env: { ...process.env, CI: 'true' },
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const json = JSON.parse(result.stdout);
  assert.equal(json.schema, 'sks.codex-compat.v1');
  assert.equal(json.required_baseline, 'rust-v0.133.0');
  assert.equal(json.hooks_schema?.ok, true);
  assert.equal(json.hooks_schema?.metadata?.tag, 'latest');
  assert.equal(json.hooks_semantic?.ok, true);
  assert.equal(json.codex_0_133?.baseline, 'rust-v0.133.0');
  assert.equal(json.legacy_baselines?.codex_0_132?.superseded_by, 'rust-v0.133.0');
});
