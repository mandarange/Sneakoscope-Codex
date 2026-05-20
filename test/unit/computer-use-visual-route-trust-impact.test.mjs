import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../src/core/fsx.mjs';

test('visual route Computer Use requirement exposes structured blocker status', async () => {
  const result = await runProcess(process.execPath, ['./dist/bin/sks.js', 'computer-use', 'require', '--route', '$QA-LOOP', '--json'], {
    env: { ...process.env, CI: 'true' },
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  const json = JSON.parse(result.stdout);
  assert.equal(json.schema, 'sks.computer-use-require.v1');
  assert.ok(['available', 'codex_app_missing', 'macos_permission_missing', 'codex_app_capability_missing', 'external_capability_blocked', 'not_macos', 'unknown'].includes(json.status));
});
