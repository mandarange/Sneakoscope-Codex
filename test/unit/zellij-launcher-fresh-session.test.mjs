import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { launchMadZellijUi } from '../../dist/core/zellij/zellij-launcher.js';

// Regression: a stable per-cwd MAD session name is reused across runs via
// idempotent `attach --create-background`. Without a reset, every new mission
// can resurrect an EXITED zombie or pile another right-split SLOTS column onto
// leftover panes. `freshSession` must `delete-session --force` so EXITED entries
// are removed (plain `kill-session` leaves "attach to resurrect" zombies).
test('launchZellijLayout resets a stale session only when freshSession is set', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-zellij-fresh-session-'));
  const previous = {
    adapter: process.env.SKS_ZELLIJ_FAKE_ADAPTER,
    fakeRoot: process.env.SKS_ZELLIJ_FAKE_ROOT,
    keep: process.env.SKS_ZELLIJ_KEEP_SESSION,
    status: process.env.SKS_ZELLIJ_CAPABILITY_FAKE_STATUS,
    version: process.env.SKS_ZELLIJ_CAPABILITY_FAKE_VERSION
  };
  process.env.SKS_ZELLIJ_FAKE_ADAPTER = '1';
  process.env.SKS_ZELLIJ_FAKE_ROOT = root;
  process.env.SKS_ZELLIJ_CAPABILITY_FAKE_STATUS = 'ok';
  process.env.SKS_ZELLIJ_CAPABILITY_FAKE_VERSION = '0.44.3';
  delete process.env.SKS_ZELLIJ_KEEP_SESSION;

  try {
    // freshSession: true => MUST issue `delete-session --force <name>` before recreating.
    const fresh = await launchMadZellijUi(['--session', 'sks-fresh'], {
      root,
      missionId: 'M-fresh',
      freshSession: true,
      ledgerRoot: path.join(root, '.sneakoscope', 'missions', 'M-fresh', 'agents'),
      recoveryAllowUnverified: true
    });
    assert.equal(fresh.ok, true, JSON.stringify({ blockers: fresh.blockers, recovery: fresh.codex_lb_tool_output_recovery }));
    assert.ok(fresh.session_reset, 'session_reset present when freshSession is set');
    assert.equal(fresh.session_reset.args[0], 'delete-session');
    assert.equal(fresh.session_reset.args[1], '--force');
    assert.equal(fresh.session_reset.args[2], 'sks-fresh');

    // freshSession omitted => MUST NOT reset (preserves resume/reuse behavior).
    const keep = await launchMadZellijUi(['--session', 'sks-fresh'], {
      root,
      missionId: 'M-keep',
      ledgerRoot: path.join(root, '.sneakoscope', 'missions', 'M-keep', 'agents'),
      recoveryAllowUnverified: true
    });
    assert.equal(keep.ok, true);
    assert.equal(keep.session_reset, null, 'no reset when freshSession is not set');

    // SKS_ZELLIJ_KEEP_SESSION=1 opt-out disables reset even with freshSession: true.
    process.env.SKS_ZELLIJ_KEEP_SESSION = '1';
    const optOut = await launchMadZellijUi(['--session', 'sks-fresh'], {
      root,
      missionId: 'M-optout',
      freshSession: true,
      ledgerRoot: path.join(root, '.sneakoscope', 'missions', 'M-optout', 'agents'),
      recoveryAllowUnverified: true
    });
    assert.equal(optOut.session_reset, null, 'opt-out env disables reset');
  } finally {
    restoreEnv('SKS_ZELLIJ_FAKE_ADAPTER', previous.adapter);
    restoreEnv('SKS_ZELLIJ_FAKE_ROOT', previous.fakeRoot);
    restoreEnv('SKS_ZELLIJ_KEEP_SESSION', previous.keep);
    restoreEnv('SKS_ZELLIJ_CAPABILITY_FAKE_STATUS', previous.status);
    restoreEnv('SKS_ZELLIJ_CAPABILITY_FAKE_VERSION', previous.version);
    await fs.rm(root, { recursive: true, force: true });
  }
});

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
