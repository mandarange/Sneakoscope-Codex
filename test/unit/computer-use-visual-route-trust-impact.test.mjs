import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../dist/core/fsx.js';

test('web visual route requirement redirects to Codex Chrome Extension gate', async () => {
  const result = await runProcess(process.execPath, ['./dist/bin/sks.js', 'computer-use', 'require', '--route', '$QA-LOOP', '--json'], {
    env: { ...process.env, CI: 'true' },
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  const json = JSON.parse(result.stdout);
  assert.equal(json.schema, 'sks.computer-use-require.v1');
  assert.equal(json.status, 'web_verification_uses_chrome_extension');
  assert.equal(json.blocker, 'web_verification_requires_codex_chrome_extension');
  assert.equal(json.evidence.status, 'not_required_for_web_verification');
  assert.equal(json.chrome_extension.schema, 'sks.codex-chrome-extension-status.v1');
});
