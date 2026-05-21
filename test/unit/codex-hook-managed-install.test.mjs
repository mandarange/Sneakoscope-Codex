import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { installManagedCodexHooks } from '../../dist/core/codex-hooks/codex-hook-managed-install.js';
import { readCodexHookActualState } from '../../dist/core/codex-hooks/codex-hook-actual-discovery.js';

test('managed hook install writes requirements.toml and actual trust entries', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-hook-managed-test-'));
  const install = await installManagedCodexHooks(root);
  const requirements = fs.readFileSync(path.join(root, '.codex', 'requirements.toml'), 'utf8');
  const actual = await readCodexHookActualState(root);
  assert.equal(install.ok, true);
  assert.match(requirements, /allow_managed_hooks_only = true/);
  assert.equal(actual.unsupported_handlers.length, 0);
  assert.ok(actual.entries.filter((entry) => entry.trust_status === 'Managed').length >= 10);
});
