import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { launchMadZellijUi } from '../../dist/core/zellij/zellij-launcher.js';

test('MAD Zellij launcher reuses an existing background session instead of blocking attach', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-zellij-existing-session-'));
  const previous = {
    adapter: process.env.SKS_ZELLIJ_FAKE_ADAPTER,
    fakeRoot: process.env.SKS_ZELLIJ_FAKE_ROOT,
    exists: process.env.SKS_ZELLIJ_FAKE_CREATE_BACKGROUND_EXISTS
  };
  process.env.SKS_ZELLIJ_FAKE_ADAPTER = '1';
  process.env.SKS_ZELLIJ_FAKE_ROOT = root;
  process.env.SKS_ZELLIJ_FAKE_CREATE_BACKGROUND_EXISTS = '1';

  try {
    const first = await launchMadZellijUi(['--session', 'sks-existing'], {
      root,
      missionId: 'M-existing-first',
      ledgerRoot: path.join(root, '.sneakoscope', 'missions', 'M-existing-first', 'agents'),
      recoveryAllowUnverified: true
    });
    assert.equal(first.ok, true, JSON.stringify({ blockers: first.blockers, recovery: first.codex_lb_tool_output_recovery }));

    const second = await launchMadZellijUi(['--session', 'sks-existing'], {
      root,
      missionId: 'M-existing-second',
      ledgerRoot: path.join(root, '.sneakoscope', 'missions', 'M-existing-second', 'agents'),
      recoveryAllowUnverified: true
    });

    assert.equal(second.ok, true);
    assert.equal(second.launch.create_background.ok, true);
    assert.deepEqual(second.blockers, []);
    assert.match(second.launch.create_background.stderr_tail, /Session already exists/);
    assert.ok(second.launch.create_background.warnings.some((warning) => warning === 'zellij_session_already_exists:sks-existing'));
    assert.equal(second.pane_proof_background, false);
    // Optional MAD launches skip the post-launch list-panes probe to avoid Zellij CLI stalls.
    assert.equal(second.pane_proof.ok, true);
    assert.equal(second.pane_proof.status, 'skipped_optional_post_launch');
    assert.ok(second.pane_proof.warnings.includes('zellij_pane_proof_skipped_optional_post_launch'));
  } finally {
    restoreEnv('SKS_ZELLIJ_FAKE_ADAPTER', previous.adapter);
    restoreEnv('SKS_ZELLIJ_FAKE_ROOT', previous.fakeRoot);
    restoreEnv('SKS_ZELLIJ_FAKE_CREATE_BACKGROUND_EXISTS', previous.exists);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('optional pane proof is skipped without blocking launch', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-zellij-optional-proof-skip-'));
  const previous = {
    adapter: process.env.SKS_ZELLIJ_FAKE_ADAPTER,
    fakeRoot: process.env.SKS_ZELLIJ_FAKE_ROOT
  };
  process.env.SKS_ZELLIJ_FAKE_ADAPTER = '1';
  process.env.SKS_ZELLIJ_FAKE_ROOT = root;

  try {
    const missionId = 'M-optional-proof-skip';
    // Even if a proof path cannot be written, optional launches must stay non-blocking.
    const proofPath = path.join(root, '.sneakoscope', 'missions', missionId, 'zellij-pane-proof.json');
    await fs.mkdir(proofPath, { recursive: true });

    const report = await launchMadZellijUi(['--session', 'sks-optional-proof-skip'], {
      root,
      missionId,
      ledgerRoot: path.join(root, '.sneakoscope', 'missions', missionId, 'agents'),
      recoveryAllowUnverified: true
    });

    assert.equal(report.ok, true, JSON.stringify({ blockers: report.blockers, recovery: report.codex_lb_tool_output_recovery }));
    assert.deepEqual(report.blockers, []);
    assert.equal(report.pane_proof_background, false);
    assert.equal(report.pane_proof.ok, true);
    assert.equal(report.pane_proof.status, 'skipped_optional_post_launch');
    assert.ok(report.pane_proof.warnings.includes('zellij_pane_proof_skipped_optional_post_launch'));
  } finally {
    restoreEnv('SKS_ZELLIJ_FAKE_ADAPTER', previous.adapter);
    restoreEnv('SKS_ZELLIJ_FAKE_ROOT', previous.fakeRoot);
    await fs.rm(root, { recursive: true, force: true });
  }
});

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
