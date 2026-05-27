import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../dist/core/fsx.js';

test('packed Computer Use visual-route requirement returns evidence or structured blocker', async () => {
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
  assert.equal(result.code, 1);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /Computer Use blocked by safety policy|MAD-SKS disabled Computer Use/i);
});
