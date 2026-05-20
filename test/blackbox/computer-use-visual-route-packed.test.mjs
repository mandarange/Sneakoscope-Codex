import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../src/core/fsx.mjs';

test('packed Computer Use visual-route requirement returns evidence or structured blocker', async () => {
  const result = await runProcess(process.execPath, ['./dist/bin/sks.js', 'computer-use', 'require', '--route', '$QA-LOOP', '--json'], {
    env: { ...process.env, CI: 'true' },
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  const json = JSON.parse(result.stdout);
  assert.equal(json.schema, 'sks.computer-use-require.v1');
  assert.ok(['available', 'codex_app_missing', 'macos_permission_missing', 'codex_app_capability_missing', 'external_capability_blocked', 'not_macos', 'unknown'].includes(json.status));
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /Computer Use blocked by safety policy|MAD-SKS disabled Computer Use/i);
});
