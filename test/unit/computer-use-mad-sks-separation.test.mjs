import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { runProcess } from '../../src/core/fsx.mjs';

test('Computer Use status output avoids MAD-SKS safety-block wording', async () => {
  const entry = path.join(process.cwd(), 'dist', 'bin', 'sks.js');
  const result = await runProcess(process.execPath, [entry, 'computer-use', 'status', '--json'], {
    env: { ...process.env, CI: 'true' },
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const text = `${result.stdout}\n${result.stderr}`;
  assert.doesNotMatch(text, /Computer Use blocked by safety policy|MAD-SKS disabled Computer Use|안전 정책상 차단/i);
  const json = JSON.parse(result.stdout);
  assert.equal(json.mad_sks_independent, true);
});
