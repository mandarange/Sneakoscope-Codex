import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../src/core/fsx.mjs';

test('scouts local-static engine runs deterministic five-scout intake', async () => {
  const result = await runProcess(process.execPath, ['bin/sks.mjs', 'scouts', 'run', 'latest', '--engine', 'local-static', '--mock', '--json'], {
    cwd: process.cwd(),
    timeoutMs: 30000,
    maxOutputBytes: 256 * 1024,
    env: { SKS_SKIP_NPM_FRESHNESS_CHECK: '1' }
  });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const json = JSON.parse(result.stdout);
  assert.equal(json.engine, 'local-static');
  assert.equal(json.completed_scouts, 5);
  assert.equal(json.performance.claim_allowed, false);
});
