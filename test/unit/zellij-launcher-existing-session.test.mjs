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
      ledgerRoot: path.join(root, '.sneakoscope', 'missions', 'M-existing-first', 'agents')
    });
    assert.equal(first.ok, true);

    const second = await launchMadZellijUi(['--session', 'sks-existing'], {
      root,
      missionId: 'M-existing-second',
      ledgerRoot: path.join(root, '.sneakoscope', 'missions', 'M-existing-second', 'agents')
    });

    assert.equal(second.ok, true);
    assert.equal(second.launch.create_background.ok, true);
    assert.deepEqual(second.blockers, []);
    assert.match(second.launch.create_background.stderr_tail, /Session already exists/);
    assert.ok(second.launch.create_background.warnings.some((warning) => warning === 'zellij_session_already_exists:sks-existing'));
    assert.equal(second.pane_proof_background, false);
    assert.equal(second.pane_proof.schema, 'sks.zellij-pane-proof.v1');
    assert.notEqual(second.pane_proof.status, 'deferred_background');
    assert.ok(!second.pane_proof.warnings.includes('zellij_pane_proof_deferred_until_after_attach'));
    await fs.access(path.join(root, '.sneakoscope', 'missions', 'M-existing-second', 'zellij-pane-proof.json'));
  } finally {
    restoreEnv('SKS_ZELLIJ_FAKE_ADAPTER', previous.adapter);
    restoreEnv('SKS_ZELLIJ_FAKE_ROOT', previous.fakeRoot);
    restoreEnv('SKS_ZELLIJ_FAKE_CREATE_BACKGROUND_EXISTS', previous.exists);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('optional pane proof failure is reported truthfully without blocking launch', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-zellij-optional-proof-failure-'));
  const previous = {
    adapter: process.env.SKS_ZELLIJ_FAKE_ADAPTER,
    fakeRoot: process.env.SKS_ZELLIJ_FAKE_ROOT
  };
  process.env.SKS_ZELLIJ_FAKE_ADAPTER = '1';
  process.env.SKS_ZELLIJ_FAKE_ROOT = root;

  try {
    const missionId = 'M-optional-proof-failure';
    const proofPath = path.join(root, '.sneakoscope', 'missions', missionId, 'zellij-pane-proof.json');
    await fs.mkdir(proofPath, { recursive: true });

    const report = await launchMadZellijUi(['--session', 'sks-optional-proof-failure'], {
      root,
      missionId,
      ledgerRoot: path.join(root, '.sneakoscope', 'missions', missionId, 'agents')
    });

    assert.equal(report.ok, true);
    assert.deepEqual(report.blockers, []);
    assert.equal(report.pane_proof_background, false);
    assert.equal(report.pane_proof.ok, false);
    assert.equal(report.pane_proof.status, 'probe_failed');
    assert.ok(report.pane_proof.blockers.some((blocker) => blocker.startsWith('zellij_pane_proof_exception:')));
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
