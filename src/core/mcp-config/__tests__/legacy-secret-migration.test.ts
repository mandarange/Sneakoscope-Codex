import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { CodexCliMutationOperation, CodexMcpCliPort } from '../codex-cli-adapter.js';
import { listMcpInventory } from '../inventory.js';
import { editMcpServer } from '../mutation.js';

class UnavailableCli implements CodexMcpCliPort {
  readonly operations: CodexCliMutationOperation[] = [];

  async list() {
    return { available: false, ok: false, rows: [], public_error: 'codex_cli_not_found' };
  }

  async transform(_before: string, operation: CodexCliMutationOperation) {
    this.operations.push(operation);
    return {
      available: false,
      ok: false,
      used: false,
      text: null,
      unsupported_reason: 'codex_cli_not_found',
      public_error: null
    };
  }

  async login() { return { available: false, ok: false, public_error: 'codex_cli_not_found' }; }
  async logout() { return { available: false, ok: false, public_error: 'codex_cli_not_found' }; }
}

async function fixture(t: test.TestContext) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-mcp-legacy-secret-'));
  const home = path.join(root, 'home');
  const configPath = path.join(home, '.codex', 'config.toml');
  const firstInlineValue = ['fixture', 'inline', 'alpha'].join('-');
  const secondInlineValue = ['fixture', 'inline', 'beta'].join('-');
  await fsp.mkdir(path.dirname(configPath), { recursive: true });
  await fsp.writeFile(configPath, [
    '[mcp_servers.docs]',
    'command = "node"',
    'env_vars = ["EXISTING_REFERENCE"]',
    `env = { API_TOKEN = ${JSON.stringify(firstInlineValue)}, CLIENT_SECRET = ${JSON.stringify(secondInlineValue)} }`,
    'startup_timeout_sec = 10',
    ''
  ].join('\n'), { mode: 0o600 });
  t.after(async () => fsp.rm(root, { recursive: true, force: true }));
  return { home, configPath, firstInlineValue, secondInlineValue };
}

test('legacy inline state exposes names and migration availability without exposing values', async (t) => {
  const s = await fixture(t);
  const inventory = await listMcpInventory('global', { home: s.home, cli: new UnavailableCli() });
  const server = inventory.servers.find((candidate) => candidate.name === 'docs');

  assert.equal(inventory.ok, true);
  assert.equal(server?.legacy_inline_secret_present, true);
  assert.deepEqual(server?.legacy_env_keys, ['API_TOKEN', 'CLIENT_SECRET']);
  const publicReceipt = JSON.stringify(inventory);
  assert.doesNotMatch(publicReceipt, new RegExp(s.firstInlineValue));
  assert.doesNotMatch(publicReceipt, new RegExp(s.secondInlineValue));
});

test('ordinary edits and explicit leave-unchanged choice preserve legacy inline values', async (t) => {
  const s = await fixture(t);
  const result = await editMcpServer('docs', {
    legacy_inline_secret_action: 'leave_unchanged',
    startup_timeout_sec: 11
  }, 'global', { home: s.home, cli: new UnavailableCli() });

  assert.equal(result.ok, true);
  const after = await fsp.readFile(s.configPath, 'utf8');
  assert.match(after, new RegExp(s.firstInlineValue));
  assert.match(after, new RegExp(s.secondInlineValue));
  assert.match(after, /startup_timeout_sec = 11/);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(s.firstInlineValue));
  assert.doesNotMatch(JSON.stringify(result), new RegExp(s.secondInlineValue));
});

test('secure-reference migration requires an exact reviewed name set and writes names only', async (t) => {
  const s = await fixture(t);
  const cli = new UnavailableCli();

  const missingReview = await editMcpServer('docs', {
    legacy_inline_secret_action: 'move_to_secure_reference'
  }, 'global', { home: s.home, cli });
  assert.deepEqual(missingReview.blockers, ['mcp_legacy_secret_review_required']);

  const mismatchedReview = await editMcpServer('docs', {
    legacy_inline_secret_action: 'move_to_secure_reference',
    reviewed_legacy_env_keys: ['API_TOKEN']
  }, 'global', { home: s.home, cli });
  assert.deepEqual(mismatchedReview.blockers, ['mcp_legacy_secret_review_mismatch']);

  const unchanged = await fsp.readFile(s.configPath, 'utf8');
  assert.match(unchanged, new RegExp(s.firstInlineValue));
  assert.match(unchanged, new RegExp(s.secondInlineValue));

  const migrated = await editMcpServer('docs', {
    legacy_inline_secret_action: 'move_to_secure_reference',
    reviewed_legacy_env_keys: ['CLIENT_SECRET', 'API_TOKEN']
  }, 'global', { home: s.home, cli });
  assert.equal(migrated.ok, true);

  const after = await fsp.readFile(s.configPath, 'utf8');
  assert.doesNotMatch(after, /\benv\s*=/);
  assert.doesNotMatch(after, new RegExp(s.firstInlineValue));
  assert.doesNotMatch(after, new RegExp(s.secondInlineValue));
  assert.match(after, /env_vars = \["API_TOKEN", "CLIENT_SECRET", "EXISTING_REFERENCE"\]/);
  assert.doesNotMatch(JSON.stringify(migrated), new RegExp(s.firstInlineValue));
  assert.doesNotMatch(JSON.stringify(migrated), new RegExp(s.secondInlineValue));
  assert.doesNotMatch(JSON.stringify(cli.operations), new RegExp(s.firstInlineValue));
  assert.doesNotMatch(JSON.stringify(cli.operations), new RegExp(s.secondInlineValue));

  const inventory = await listMcpInventory('global', { home: s.home, cli });
  assert.equal(inventory.servers[0]?.legacy_inline_secret_present, false);
  assert.deepEqual(inventory.servers[0]?.env_vars, ['API_TOKEN', 'CLIENT_SECRET', 'EXISTING_REFERENCE']);
});

test('migration control fields cannot bypass the explicit choice gate', async (t) => {
  const s = await fixture(t);
  const cli = new UnavailableCli();
  const reviewWithoutChoice = await editMcpServer('docs', {
    reviewed_legacy_env_keys: ['API_TOKEN', 'CLIENT_SECRET']
  }, 'global', { home: s.home, cli });
  assert.deepEqual(reviewWithoutChoice.blockers, ['invalid_mcp_legacy_secret_action']);

  const reviewOnLeave = await editMcpServer('docs', {
    legacy_inline_secret_action: 'leave_unchanged',
    reviewed_legacy_env_keys: ['API_TOKEN', 'CLIENT_SECRET']
  }, 'global', { home: s.home, cli });
  assert.deepEqual(reviewOnLeave.blockers, ['mcp_legacy_secret_review_not_allowed_for_leave_unchanged']);
  assert.equal(cli.operations.length, 0);
});

test('unsupported legacy key shapes fail closed and preserve the inline value', async (t) => {
  const s = await fixture(t);
  const unsupportedValue = ['fixture', 'unsupported', 'value'].join('-');
  await fsp.writeFile(s.configPath, [
    '[mcp_servers.docs]',
    'command = "node"',
    `env = { "BAD-NAME" = ${JSON.stringify(unsupportedValue)} }`,
    ''
  ].join('\n'), { mode: 0o600 });

  const result = await editMcpServer('docs', {
    legacy_inline_secret_action: 'move_to_secure_reference',
    reviewed_legacy_env_keys: []
  }, 'global', { home: s.home, cli: new UnavailableCli() });
  assert.deepEqual(result.blockers, ['mcp_legacy_secret_secure_reference_names_unavailable']);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(unsupportedValue));
  assert.match(await fsp.readFile(s.configPath, 'utf8'), new RegExp(unsupportedValue));
});
