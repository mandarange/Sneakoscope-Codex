import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('OAuth release fails closed and rolls auth back when unparseable config blocks provider deselection', async () => {
  const { releaseCodexLbAuthHold } = await import('../../dist/cli/install-helpers.js');
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-codex-lb-oauth-release-guard-'));
  const codexHome = path.join(home, '.codex');
  const configPath = path.join(codexHome, 'config.toml');
  const authPath = path.join(codexHome, 'auth.json');
  const backupPath = path.join(codexHome, 'auth.chatgpt-backup.json');
  const catalogPath = path.join(codexHome, 'sks-codex-lb-tool-catalog.json');
  await fs.mkdir(codexHome, { recursive: true });

  const brokenConfig = [
    'model_provider = "codex-lb"',
    `model_catalog_json = "${catalogPath}"`,
    'model = "gpt-5.6-terra"',
    '[features',
    'fast_mode = true',
    ''
  ].join('\n');
  const apiKeyAuth = `${JSON.stringify({ auth_mode: 'apikey', OPENAI_API_KEY: 'sk-current' }, null, 2)}\n`;
  const oauthBackup = `${JSON.stringify({
    auth_mode: 'chatgpt',
    tokens: { id_token: 'oauth-id', access_token: 'oauth-access', refresh_token: 'oauth-refresh' },
    account_id: 'acct-release-guard'
  }, null, 2)}\n`;
  await fs.writeFile(configPath, brokenConfig, 'utf8');
  await fs.writeFile(authPath, apiKeyAuth, 'utf8');
  await fs.writeFile(backupPath, oauthBackup, 'utf8');

  const result = await releaseCodexLbAuthHold({ home, configPath, authPath, backupPath, deleteBackup: true });
  const configAfter = await fs.readFile(configPath, 'utf8');
  const authAfter = await fs.readFile(authPath, 'utf8');

  assert.equal(result.ok, false);
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'provider_unselect_failed');
  assert.equal(result.provider_unselected, false);
  assert.equal(result.provider_status, 'failed');
  assert.match(result.provider_error, /unparseable_config_preserved/);
  assert.equal(result.rollback_safe, true);
  assert.equal(result.auth_rollback?.status, 'restored_previous_auth');
  assert.equal(result.backup_removed, false);
  assert.equal(configAfter, brokenConfig);
  assert.match(configAfter, /^model_provider = "codex-lb"$/m);
  assert.match(configAfter, /^model_catalog_json = /m);
  assert.equal(authAfter, apiKeyAuth);
  await assert.doesNotReject(fs.access(backupPath));
  await assert.rejects(fs.access(catalogPath));
});

test('already-active OAuth is not reported healthy when guarded provider deselection fails', async () => {
  const { releaseCodexLbAuthHold } = await import('../../dist/cli/install-helpers.js');
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-codex-lb-oauth-active-guard-'));
  const codexHome = path.join(home, '.codex');
  const configPath = path.join(codexHome, 'config.toml');
  const authPath = path.join(codexHome, 'auth.json');
  const catalogPath = path.join(codexHome, 'sks-codex-lb-tool-catalog.json');
  await fs.mkdir(codexHome, { recursive: true });
  const brokenConfig = `model_provider = "codex-lb"\nmodel_catalog_json = "${catalogPath}"\n[broken\n`;
  const oauth = `${JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'oauth-access', refresh_token: 'oauth-refresh' } }, null, 2)}\n`;
  await fs.writeFile(configPath, brokenConfig, 'utf8');
  await fs.writeFile(authPath, oauth, 'utf8');

  const result = await releaseCodexLbAuthHold({ home, configPath, authPath });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'failed');
  assert.equal(result.provider_unselected, false);
  assert.match(result.provider_error, /unparseable_config_preserved/);
  assert.equal(await fs.readFile(configPath, 'utf8'), brokenConfig);
  assert.equal(await fs.readFile(authPath, 'utf8'), oauth);
});
