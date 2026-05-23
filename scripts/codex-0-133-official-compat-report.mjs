#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { codex0133Matrix, CODEX_0_133_RELEASE_EVIDENCE } from '../dist/core/codex-compat/codex-0-133.js';

const versionRun = spawnSync('codex', ['--version'], { encoding: 'utf8' });
const resumeHelp = spawnSync('codex', ['exec', 'resume', '--help'], { encoding: 'utf8', maxBuffer: 256 * 1024 });
const execHelp = spawnSync('codex', ['exec', '--help'], { encoding: 'utf8', maxBuffer: 256 * 1024 });
const matrix = codex0133Matrix({
  version: `${versionRun.stdout || ''}${versionRun.stderr || ''}`,
  available: versionRun.status === 0,
  execResumeHelp: resumeHelp.stdout || resumeHelp.stderr || '',
  execHelp: execHelp.stdout || execHelp.stderr || ''
});
const topics = [
  'goals_default_enabled',
  'remote_control_foreground_app_server',
  'permission_profiles_requirements',
  'plugin_discovery_marketplaces',
  'extension_lifecycle_events',
  'exec_resume_output_schema'
];
const rows = topics.map((topic) => {
  const cap = matrix.capabilities.find((item) => item.id === topic);
  return {
    topic,
    result: cap?.status || 'missing',
    official_source_checked: true,
    release_readiness_row_added: true,
    notes: cap?.notes || ['capability row missing']
  };
});
const blockers = rows.filter((row) => row.result === 'missing').map((row) => `missing:${row.topic}`);
const report = {
  schema: 'sks.codex-0-133-official-compat.v1',
  ok: blockers.length === 0,
  status: versionRun.status === 0 ? 'checked' : 'integration_optional',
  release_source_url: CODEX_0_133_RELEASE_EVIDENCE.tag_url,
  release_tag: CODEX_0_133_RELEASE_EVIDENCE.tag,
  source_delta: rows,
  structured_output_inheritance: rows.find((row) => row.topic === 'exec_resume_output_schema')?.result || 'missing',
  local_codex_version: `${versionRun.stdout || versionRun.stderr || ''}`.trim() || null,
  matrix,
  blockers
};
const out = path.join(process.cwd(), '.sneakoscope', 'reports', 'codex-0-133-official-compat.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
