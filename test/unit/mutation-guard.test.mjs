import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  guardedWriteFile,
  guardedGlobalCodexConfigWrite,
  guardContextForRoute,
  MutationGuardViolationError
} from '../../dist/core/safety/mutation-guard.js';
import { createRequestedScopeContract } from '../../dist/core/safety/requested-scope-contract.js';
import { mutationLedgerPath } from '../../dist/core/safety/mutation-ledger.js';

async function tempRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'sks-mut-guard-'));
}

async function readLedger(root) {
  const text = await fs.readFile(mutationLedgerPath(root), 'utf8').catch(() => '');
  return text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

test('in-scope project file write applies and records one ledger entry', async () => {
  const root = await tempRoot();
  const contract = createRequestedScopeContract({ route: 'test', userRequest: 'write a project file', projectRoot: root });
  const ctx = guardContextForRoute(root, contract);
  const target = path.join(root, 'note.txt');

  await guardedWriteFile(ctx, target, 'hello\n');

  assert.equal(await fs.readFile(target, 'utf8'), 'hello\n');
  const ledger = await readLedger(root);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].kind, 'file_write');
  assert.equal(ledger[0].applied, true);
  assert.equal(ledger[0].violation, false);
});

test('out-of-scope global config write throws and does NOT apply', async () => {
  const root = await tempRoot();
  // Default contract: global_codex_config is denied (deny-by-default).
  const contract = createRequestedScopeContract({ route: 'test', userRequest: 'no global writes', projectRoot: root });
  const ctx = guardContextForRoute(root, contract);
  const target = path.join(root, 'fake-global-config.toml');

  await assert.rejects(
    () => guardedGlobalCodexConfigWrite(ctx, target, 'sandbox_mode = "workspace-write"\n', { confirmed: true, backupPath: path.join(root, 'bak') }),
    MutationGuardViolationError
  );
  // File must not exist — apply never ran.
  await assert.rejects(() => fs.readFile(target, 'utf8'));
});

test('global config write in scope but without backup or no-op reason throws pre-apply', async () => {
  const root = await tempRoot();
  const contract = createRequestedScopeContract({
    route: 'test', userRequest: 'allow global', projectRoot: root,
    overrides: { global_codex_config: true }
  });
  const ctx = guardContextForRoute(root, contract);
  const target = path.join(root, 'global.toml');

  await assert.rejects(
    () => guardedGlobalCodexConfigWrite(ctx, target, 'x = 1\n', { confirmed: true }),
    (err) => err instanceof MutationGuardViolationError && /backup_or_no_op_reason_required/.test(err.reason)
  );
  await assert.rejects(() => fs.readFile(target, 'utf8'));
});

test('global config write in scope WITH backup applies and records backup_path', async () => {
  const root = await tempRoot();
  const contract = createRequestedScopeContract({
    route: 'test', userRequest: 'allow global', projectRoot: root,
    overrides: { global_codex_config: true }
  });
  const ctx = guardContextForRoute(root, contract);
  const target = path.join(root, 'global.toml');
  const backup = path.join(root, 'global.toml.bak');

  await guardedGlobalCodexConfigWrite(ctx, target, 'sandbox_mode = "workspace-write"\n', { confirmed: true, backupPath: backup });

  assert.match(await fs.readFile(target, 'utf8'), /sandbox_mode/);
  const ledger = await readLedger(root);
  const entry = ledger.find((e) => e.kind === 'global_config_write');
  assert.ok(entry);
  assert.equal(entry.applied, true);
  assert.equal(entry.violation, false);
  assert.equal(entry.backup_path, backup);
});
