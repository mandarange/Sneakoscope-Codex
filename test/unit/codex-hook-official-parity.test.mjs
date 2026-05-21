import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { installManagedCodexHooks } from '../../dist/core/codex-hooks/codex-hook-managed-install.js';
import { codexHookOfficialParityReport } from '../../dist/core/codex-hooks/codex-hook-official-parity.js';

test('official hook parity enforces managed policy when Codex hashes are unavailable', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-hook-parity-test-'));
  await installManagedCodexHooks(root);
  const report = await codexHookOfficialParityReport(root);
  assert.equal(report.ok, true);
  assert.equal(report.policy.sks_trusted_hash_fallback_allowed, false);
  assert.equal(report.policy.managed_only_enforced, true);
});
