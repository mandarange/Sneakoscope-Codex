import test from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../../dist/core/fsx.js';

test('agent terminal and tmux packed gates run', async () => {
  const terminal = await runProcess('npm', ['run', 'agent:background-terminals', '--silent'], { timeoutMs: 60_000, maxOutputBytes: 256 * 1024 });
  assert.equal(terminal.code, 0, terminal.stderr || terminal.stdout);
  const tmux = await runProcess('npm', ['run', 'agent:tmux-right-lanes', '--silent'], { timeoutMs: 60_000, maxOutputBytes: 256 * 1024 });
  assert.equal(tmux.code, 0, tmux.stderr || tmux.stdout);
});
