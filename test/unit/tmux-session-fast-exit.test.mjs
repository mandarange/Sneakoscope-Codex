import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('createTmuxSession rejects sessions whose first pane exits immediately', async () => {
  const tmux = spawnSync('tmux', ['-V'], { encoding: 'utf8' });
  if (tmux.status !== 0) {
    assert.ok(true, 'tmux unavailable; real tmux fast-exit regression skipped');
    return;
  }

  const mod = await import('../../dist/core/tmux-ui.js');
  const session = `sks-fast-exit-${Date.now().toString(36)}`;
  try {
    const result = await mod.createTmuxSession(
      { root: process.cwd(), session, tmux: { bin: 'tmux' }, command: 'sh -c "exit 42"' },
      [{ cwd: process.cwd(), command: 'sh -c "exit 42"', role: 'codex', title: 'fast-exit' }],
      { recreate: true }
    );
    assert.equal(result.ok, false);
    assert.match(result.stderr, /ended immediately|not present after creation/);
  } finally {
    spawnSync('tmux', ['kill-session', '-t', session], { encoding: 'utf8' });
  }
});

test('MAD codex launch command can hold the pane open after fast exit', async () => {
  const mod = await import('../../dist/core/tmux-ui.js');
  const regular = mod.codexLaunchCommand('/tmp/sks-root', 'codex', []);
  const held = mod.codexLaunchCommand('/tmp/sks-root', 'codex', [], {}, { holdOnFastExit: true });
  assert.match(regular, /exec 'codex'/);
  assert.doesNotMatch(regular, /Keeping this tmux pane open/);
  assert.match(held, /__sks_codex_status/);
  assert.match(held, /Keeping this tmux pane open/);
});
