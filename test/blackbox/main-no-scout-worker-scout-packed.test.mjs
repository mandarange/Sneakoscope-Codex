import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../dist/core/fsx.js';

test('main no-Scout and worker Scout packed gates run', async () => {
  const main = await runProcess('npm', ['run', 'agent:main-no-scout', '--silent'], { timeoutMs: 60_000, maxOutputBytes: 256 * 1024 });
  assert.equal(main.code, 0, main.stderr || main.stdout);
  const worker = await runProcess('npm', ['run', 'agent:worker-scout-limited', '--silent'], { timeoutMs: 60_000, maxOutputBytes: 256 * 1024 });
  assert.equal(worker.code, 0, worker.stderr || worker.stdout);
});
