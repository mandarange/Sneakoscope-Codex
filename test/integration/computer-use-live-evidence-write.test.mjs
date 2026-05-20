import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { runProcess } from '../../dist/core/fsx.js';

test('Computer Use real smoke writes live evidence artifact when requested', async () => {
  const result = await runProcess(process.execPath, ['./dist/bin/sks.js', 'computer-use', 'smoke', '--real', '--capture-screenshot', '--json'], {
    env: { ...process.env, CI: 'true', SKS_TEST_REAL_COMPUTER_USE: '' },
    timeoutMs: 20_000,
    maxOutputBytes: 256 * 1024
  });
  const json = JSON.parse(result.stdout);
  assert.equal(json.schema, 'sks.computer-use-live-smoke.v2');
  assert.ok(json.live_evidence_path);
  const evidence = JSON.parse(await fs.readFile(json.live_evidence_path, 'utf8'));
  assert.equal(evidence.schema, 'sks.computer-use-live-evidence.v1');
  assert.equal(evidence.mock, false);
});
