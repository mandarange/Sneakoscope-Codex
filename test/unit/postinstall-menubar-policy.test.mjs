import test from 'node:test';
import assert from 'node:assert/strict';
import { describePostinstallMenuBar, ensureSksMenuBarDuringPostinstall, postinstallMenuBarPolicy } from '../../dist/cli/install-helpers-menubar.js';

const tty = { stdinTTY: true, stdoutTTY: true };
const piped = { stdinTTY: false, stdoutTTY: false };

test('interactive global macOS installs get the Menu Bar; dependency, CI and piped installs stay inert', () => {
  assert.equal(postinstallMenuBarPolicy({ npm_config_global: 'true' }, tty, 'darwin').install, true);
  assert.equal(postinstallMenuBarPolicy({ npm_config_global: 'true' }, tty, 'darwin').launch, true);
  assert.equal(postinstallMenuBarPolicy({ npm_config_global: 'true' }, piped, 'darwin').install, false);
  assert.equal(postinstallMenuBarPolicy({ npm_config_global: 'true', CI: 'true' }, tty, 'darwin').install, false);
  assert.equal(postinstallMenuBarPolicy({}, tty, 'darwin').install, false);
  assert.equal(postinstallMenuBarPolicy({ npm_config_global: 'true' }, tty, 'linux').install, false);
  assert.equal(postinstallMenuBarPolicy({ npm_config_global: 'true', SKS_POSTINSTALL_NO_MENUBAR: '1' }, tty, 'darwin').install, false);
  assert.equal(postinstallMenuBarPolicy({ npm_config_global: 'true', SKS_POSTINSTALL_NO_BOOTSTRAP: '1', SKS_POSTINSTALL_MENUBAR: '1' }, tty, 'darwin').install, false);
});

test('explicit opt-ins install even when piped, and launch honours the deferral switches', () => {
  assert.equal(postinstallMenuBarPolicy({ SKS_POSTINSTALL_MENUBAR: '1' }, piped, 'darwin').install, true);
  assert.equal(postinstallMenuBarPolicy({ SKS_POSTINSTALL_BOOTSTRAP: '1' }, piped, 'darwin').install, false);
  assert.equal(postinstallMenuBarPolicy({ SKS_POSTINSTALL_MENUBAR: '1', SKS_SKIP_SKS_MENUBAR_LAUNCH: '1' }, piped, 'darwin').launch, false);
  assert.equal(postinstallMenuBarPolicy({ SKS_POSTINSTALL_MENUBAR: '1', SKS_UPDATE_DEFER_MENUBAR_RESTART: '1' }, piped, 'darwin').launch, false);
});

test('ensure never throws, maps installer results, and skips without touching the installer', async () => {
  let calls = 0;
  const skipped = await ensureSksMenuBarDuringPostinstall({ npm_config_global: 'true' }, piped, async () => { calls += 1; return {}; });
  assert.equal(skipped.status, 'skipped');
  assert.equal(calls, 0);
  const installed = await ensureSksMenuBarDuringPostinstall({ SKS_POSTINSTALL_MENUBAR: '1' }, piped, async (opts) => {
    calls += 1;
    assert.equal(opts.apply, true);
    assert.equal(opts.quiet, true);
    return { ok: true, actions: ['compiled 37 Swift sources'], app_path: '/tmp/SKSMenuBar.app', launch: { requested: true, ok: true }, blockers: [] };
  });
  assert.equal(calls, 1);
  assert.equal(installed.status, 'installed');
  assert.equal(installed.launched, true);
  assert.match(describePostinstallMenuBar(installed), /installed at \/tmp\/SKSMenuBar.app and started/);
  const current = await ensureSksMenuBarDuringPostinstall({ SKS_POSTINSTALL_MENUBAR: '1' }, piped, async () => ({ ok: true, actions: ['menubar_up_to_date'], app_path: '/tmp/SKSMenuBar.app', launch: { requested: false, ok: true }, blockers: [] }));
  assert.equal(current.status, 'up_to_date');
  const blocked = await ensureSksMenuBarDuringPostinstall({ SKS_POSTINSTALL_MENUBAR: '1' }, piped, async () => ({ ok: false, actions: [], app_path: null, launch: { requested: false, ok: false }, blockers: ['swiftc_missing'] }));
  assert.equal(blocked.status, 'blocked');
  assert.match(describePostinstallMenuBar(blocked), /swiftc_missing/);
  const failed = await ensureSksMenuBarDuringPostinstall({ SKS_POSTINSTALL_MENUBAR: '1' }, piped, async () => { throw new Error('boom'); });
  assert.equal(failed.status, 'failed');
  assert.match(describePostinstallMenuBar(failed), /boom/);
  assert.match(describePostinstallMenuBar(skipped), /not installed during npm install \(non-interactive install\)/);
});
