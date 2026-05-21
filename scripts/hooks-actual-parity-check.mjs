#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installManagedCodexHooks } from '../dist/core/codex-hooks/codex-hook-managed-install.js';
import { writeCodexHookOfficialParityReport } from '../dist/core/codex-hooks/codex-hook-official-parity.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-hooks-actual-parity-'));
const install = await installManagedCodexHooks(root);
const report = await writeCodexHookOfficialParityReport(root, {
  outputPath: path.join(root, '.sneakoscope', 'reports', 'codex-hook-parity-1.14.0.json')
});
const ok = install.ok && report.ok && report.policy.managed_only_enforced === true;
console.log(JSON.stringify({ schema: 'sks.hooks-actual-parity-check.v1', ok, install, report_path: report.path, policy: report.policy }, null, 2));
if (!ok) process.exitCode = 1;
