#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installManagedCodexHooks } from '../core/codex-hooks/codex-hook-managed-install.js';
import { codexHookOfficialParityReport } from '../core/codex-hooks/codex-hook-official-parity.js';
import { resolveCodexHookHashOracle } from '../core/codex-hooks/codex-hook-official-hash-oracle.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-hooks-oracle-'));
await installManagedCodexHooks(root);
const oracle = await resolveCodexHookHashOracle(root, {
  event: 'PreToolUse',
  matcher: 'Read',
  command: 'sks hook pre-tool',
  timeout: 600,
  async: false
});
const parity = await codexHookOfficialParityReport(root);
const ok = parity.ok
  && parity.schema === 'sks.codex-hook-official-parity.v2'
  && parity.policy.sks_trusted_hash_fallback_allowed === false
  && (oracle.schema === 'sks.codex-hook-hash-oracle.v1');
const result = {
  schema: 'sks.hooks-official-hash-oracle-check.v1',
  ok,
  oracle,
  parity_status: parity.status,
  official_hash_available: parity.official_hash_available,
  unmanaged_trusted_hash_writer_enabled: parity.unmanaged_trusted_hash_writer_enabled,
  managed_policy_used: parity.managed_policy_used
};
console.log(JSON.stringify(result, null, 2));
if (!ok) process.exitCode = 1;
