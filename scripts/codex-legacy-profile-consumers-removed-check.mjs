#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { root } from './lib/ensure-dist-fresh.mjs';

const files = [
  'src/core/codex/codex-project-config-policy.ts',
  'src/core/codex/codex-cli-syntax-builder.ts',
  'src/core/agents/agent-runner-codex-exec.ts',
  'src/core/agents/codex-exec-worker-adapter.ts'
];
const issues = [];
for (const rel of files) {
  const text = await fs.readFile(path.join(root, rel), 'utf8');
  if (/\$\{profileName\}\.config\.toml|selected_profile_table_moved_to_profile_config/.test(text)) issues.push(`${rel}:legacy_profile_config_file_consumer`);
  if (/codex_permission_profile[^]*--profile/.test(text)) issues.push(`${rel}:permission_profile_confused_with_config_profile`);
}
const ok = issues.length === 0;
emit({ schema: 'sks.codex-legacy-profile-consumers-removed-check.v1', ok, files, issues });

function emit(report) { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1; }
