import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../dist/core/fsx.js';

test('blackbox Computer Use status has no forbidden safety-block wording', async () => {
  const result = await runProcess(process.execPath, ['./dist/bin/sks.js', 'computer-use', 'status', '--json'], {
    env: { ...process.env, CI: 'true' },
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const text = `${result.stdout}\n${result.stderr}`;
  assert.doesNotMatch(text, /Computer Use blocked by safety policy|Computer Use access is unsafe|MAD-SKS disabled Computer Use|안전 정책상 차단/i);
  const json = JSON.parse(result.stdout);
  assert.equal(json.schema, 'sks.computer-use-status.v1');
  assert.equal(json.mad_sks_independent, true);
});
