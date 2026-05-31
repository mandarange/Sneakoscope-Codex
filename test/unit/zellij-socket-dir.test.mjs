import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ZELLIJ_SESSION_NAME_MAX,
  sanitizeZellijSessionName
} from '../../dist/core/zellij/zellij-launcher.js';
import {
  ZELLIJ_UNIX_SOCKET_PATH_LIMIT,
  defaultZellijSocketDir,
  estimateZellijSocketPathLength,
  formatZellijCommand,
  isZellijSocketPathTooLong,
  prepareZellijProcessEnv
} from '../../dist/core/zellij/zellij-command.js';

test('SKS-provided Zellij socket dir stays short enough for macOS IPC paths', async () => {
  const prepared = await prepareZellijProcessEnv({
    TMPDIR: '/var/folders/n2/cngnqhgd453fc04dl2kk6jdm0000gn/T/'
  });
  assert.equal(prepared.meta.zellij_socket_dir_source, 'sks_default');
  assert.equal(prepared.env.ZELLIJ_SOCKET_DIR, defaultZellijSocketDir());

  const session = sanitizeZellijSessionName('sks-codex-lb-mptvbk59-Sneakoscope-Codex'.repeat(4));
  assert.ok(session.length <= ZELLIJ_SESSION_NAME_MAX);
  assert.ok(
    estimateZellijSocketPathLength(prepared.env.ZELLIJ_SOCKET_DIR, session) <= ZELLIJ_UNIX_SOCKET_PATH_LIMIT,
    'socket path should remain under the Unix-domain socket path limit'
  );
});

test('explicit ZELLIJ_SOCKET_DIR is preserved and surfaced in attach commands', async () => {
  const prepared = await prepareZellijProcessEnv({ ZELLIJ_SOCKET_DIR: '/custom/zellij' });
  assert.equal(prepared.meta.zellij_socket_dir_source, 'env');
  assert.equal(prepared.env.ZELLIJ_SOCKET_DIR, '/custom/zellij');
  assert.equal(
    formatZellijCommand(['attach', 'sks-session'], prepared.meta),
    'ZELLIJ_SOCKET_DIR=/custom/zellij zellij attach sks-session'
  );
});

test('Zellij IPC socket path length failures get a precise blocker', () => {
  assert.equal(
    isZellijSocketPathTooLong('Error: the IPC socket path is too long (118 bytes, max 103)'),
    true
  );
});
