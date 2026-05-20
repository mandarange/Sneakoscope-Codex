import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../src/core/fsx.mjs';

test('visual route Computer Use requirement returns status plus evidence skeleton', async () => {
  const result = await runProcess(process.execPath, ['./dist/bin/sks.js', 'computer-use', 'require', '--route', '$Image-UX-Review', '--json'], {
    env: { ...process.env, CI: 'true' },
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  const json = JSON.parse(result.stdout);
  assert.equal(json.schema, 'sks.computer-use-require.v1');
  assert.equal(json.evidence.schema, 'sks.computer-use-evidence.v1');
  assert.equal(json.evidence.status, json.status);
});
