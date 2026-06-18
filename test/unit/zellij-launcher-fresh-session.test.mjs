import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { launchMadZellijUi } from '../../dist/core/zellij/zellij-launcher.js';

// Regression: a stable per-cwd MAD session name (sks-mad-<cwd>) is reused across
// runs via idempotent `attach --create-background`. Without a reset, every new
// mission split ANOTHER `--direction right` SLOTS column onto the leftover panes,
// fragmenting the screen into side-by-side columns. `freshSession` must kill the
// stale session first so each launch starts main-only.
test('launchZellijLayout resets a stale session only when freshSession is set', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-zellij-fresh-session-'));
  const previous = {
    adapter: process.env.SKS_ZELLIJ_FAKE_ADAPTER,
    fakeRoot: process.env.SKS_ZELLIJ_FAKE_ROOT,
    keep: process.env.SKS_ZELLIJ_KEEP_SESSION
  };
  process.env.SKS_ZELLIJ_FAKE_ADAPTER = '1';
  process.env.SKS_ZELLIJ_FAKE_ROOT = root;
  delete process.env.SKS_ZELLIJ_KEEP_SESSION;

  try {
    // freshSession: true => MUST issue `kill-session <name>` before recreating.
    const fresh = await launchMadZellijUi(['--session', 'sks-fresh'], {
      root,
      missionId: 'M-fresh',
      freshSession: true,
      ledgerRoot: path.join(root, '.sneakoscope', 'missions', 'M-fresh', 'agents')
    });
    assert.equal(fresh.ok, true);
    assert.ok(fresh.session_reset, 'session_reset present when freshSession is set');
    assert.equal(fresh.session_reset.args[0], 'kill-session');
    assert.equal(fresh.session_reset.args[1], 'sks-fresh');

    // freshSession omitted => MUST NOT reset (preserves resume/reuse behavior).
    const keep = await launchMadZellijUi(['--session', 'sks-fresh'], {
      root,
      missionId: 'M-keep',
      ledgerRoot: path.join(root, '.sneakoscope', 'missions', 'M-keep', 'agents')
    });
    assert.equal(keep.ok, true);
    assert.equal(keep.session_reset, null, 'no reset when freshSession is not set');

    // SKS_ZELLIJ_KEEP_SESSION=1 opt-out disables reset even with freshSession: true.
    process.env.SKS_ZELLIJ_KEEP_SESSION = '1';
    const optOut = await launchMadZellijUi(['--session', 'sks-fresh'], {
      root,
      missionId: 'M-optout',
      freshSession: true,
      ledgerRoot: path.join(root, '.sneakoscope', 'missions', 'M-optout', 'agents')
    });
    assert.equal(optOut.session_reset, null, 'opt-out env disables reset');
  } finally {
    restoreEnv('SKS_ZELLIJ_FAKE_ADAPTER', previous.adapter);
    restoreEnv('SKS_ZELLIJ_FAKE_ROOT', previous.fakeRoot);
    restoreEnv('SKS_ZELLIJ_KEEP_SESSION', previous.keep);
    await fs.rm(root, { recursive: true, force: true });
  }
});

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
