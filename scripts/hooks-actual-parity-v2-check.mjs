#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installManagedCodexHooks } from '../dist/core/codex-hooks/codex-hook-managed-install.js';
import { writeCodexHookOfficialParityReport } from '../dist/core/codex-hooks/codex-hook-official-parity.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-hooks-actual-v2-'));
const install = await installManagedCodexHooks(root);
const report = await writeCodexHookOfficialParityReport(root, {
  outputPath: path.join(root, '.sneakoscope', 'reports', 'codex-hook-parity-1.14.1.json')
});
const ok = install.ok
  && report.ok
  && report.schema === 'sks.codex-hook-official-parity.v2'
  && report.coverage.requirements_toml === 'covered'
  && report.unmanaged_trusted_hash_writer_enabled === false;
console.log(JSON.stringify({ schema: 'sks.hooks-actual-parity-v2-check.v1', ok, report_path: report.path, coverage: report.coverage, policy: report.policy }, null, 2));
if (!ok) process.exitCode = 1;
