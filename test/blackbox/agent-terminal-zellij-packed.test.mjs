import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../dist/core/fsx.js';

test('agent terminal and Zellij packed gates run', async () => {
  const terminal = await runProcess('npm', ['run', 'agent:background-terminals', '--silent'], { timeoutMs: 60_000, maxOutputBytes: 256 * 1024 });
  assert.equal(terminal.code, 0, terminal.stderr || terminal.stdout);
  const zellij = await runProcess('npm', ['run', 'agent:zellij-runtime', '--silent'], { timeoutMs: 60_000, maxOutputBytes: 256 * 1024 });
  assert.equal(zellij.code, 0, zellij.stderr || zellij.stdout);
});
