#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installManagedCodexHooks } from '../dist/core/codex-hooks/codex-hook-managed-install.js';
import { codexHookOfficialParityReport } from '../dist/core/codex-hooks/codex-hook-official-parity.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-hooks-official-hash-'));
await installManagedCodexHooks(root);
const report = await codexHookOfficialParityReport(root);
const ok = report.ok
  && report.fixture_parity.ok === true
  && report.policy.sks_trusted_hash_fallback_allowed === false;
console.log(JSON.stringify({ schema: 'sks.hooks-official-hash-parity-check.v1', ok, status: report.status, fixture_parity: report.fixture_parity, policy: report.policy }, null, 2));
if (!ok) process.exitCode = 1;
