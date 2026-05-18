#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const contract = process.argv.includes('--contract') || process.env.SKS_REAL_BLACKBOX_MATRIX === '0';
const real = !contract;
const root = process.cwd();
const rows = [
  row('npm_pack_local_tarball', 'blackbox:pack-install', ['npm_pack']),
  row('temp_npm_install', 'blackbox:pack-install', ['npm_install_tarball']),
  row('npx_one_shot', 'blackbox:npx', ['npm_exec_one_shot_version', 'npm_exec_one_shot_root']),
  row('global_shim_temp_prefix', 'blackbox:global-shim', ['npm_install_global_prefix', 'global_shim_version']),
  row('fresh_home', 'blackbox:pack-install', ['npx_sks_root_json']),
  row('project_local_install', 'blackbox:pack-install', ['npx_sks_setup_local_only']),
  row('packed_run_execute', 'blackbox:pack-install', ['npx_sks_run_execute_mock']),
  row('no_git_repo_directory', 'blackbox:pack-install', ['npx_sks_root_json']),
  row('read_only_project_directory', 'blackbox:pack-install', ['npx_sks_root_json'], { optional: true }),
  row('path_with_spaces', 'blackbox:pack-install', ['npx_sks_root_json']),
  row('korean_unicode_path', 'blackbox:pack-install', ['npx_sks_root_json'])
];

if (real) {
  for (const script of ['blackbox:pack-install', 'blackbox:npx', 'blackbox:global-shim']) {
    const result = spawnSync('npm', ['run', script, '--', '--json'], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
    const parsed = parseJsonFromStdout(result.stdout);
    for (const item of rows.filter((entry) => entry.script === script)) {
      const labelsOk = item.required_step_labels.length
        ? item.required_step_labels.every((label) => parsed?.steps?.some((step) => step.label === label && step.ok))
        : result.status === 0;
      item.ok = item.optional ? true : (result.status === 0 && labelsOk);
      item.status = item.ok ? (item.optional && !labelsOk ? 'verified_partial' : 'verified') : 'blocked';
      item.stderr_tail = String(result.stderr || '').slice(-500);
      item.duration_ms = parsed?.steps?.filter((step) => item.required_step_labels.includes(step.label)).reduce((sum, step) => sum + Number(step.duration_ms || 0), 0) || null;
    }
  }
}

const report = {
  schema: 'sks.blackbox-matrix.v2',
  ok: rows.every((entry) => entry.ok),
  mode: real ? 'real' : 'contract',
  rows
};
const out = path.join(root, '.sneakoscope', 'reports', 'blackbox-matrix.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, report_path: out }, null, 2));
if (!report.ok) process.exitCode = 1;

function row(id, script, requiredStepLabels = [], extra = {}) {
  return {
    id,
    script,
    required_step_labels: requiredStepLabels,
    ok: !real,
    status: real ? 'pending' : 'verified_partial',
    command: script,
    note: real ? 'runs the selected package blackbox script in real mode' : 'contract quick mode; release gate uses real mode',
    ...extra
  };
}

function parseJsonFromStdout(stdout = '') {
  try {
    const start = String(stdout).indexOf('{');
    return start >= 0 ? JSON.parse(String(stdout).slice(start)) : null;
  } catch {
    return null;
  }
}
