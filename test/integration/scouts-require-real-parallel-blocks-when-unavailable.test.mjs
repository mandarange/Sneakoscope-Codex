import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../src/core/fsx.mjs';

test('scouts require-real-parallel blocks explicit fallback engines', async () => {
  const result = await runProcess(process.execPath, ['bin/sks.mjs', 'scouts', 'run', 'latest', '--engine', 'local-static', '--require-real-parallel', '--mock', '--json'], {
    cwd: process.cwd(),
    timeoutMs: 30000,
    maxOutputBytes: 128 * 1024,
    env: { SKS_SKIP_NPM_FRESHNESS_CHECK: '1' }
  });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, false);
  assert.ok(json.gate.blockers.includes('real_parallel_engine_required_but_unavailable'));
});
