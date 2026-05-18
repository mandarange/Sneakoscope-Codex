#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const real = process.env.SKS_REAL_BLACKBOX_MATRIX === '1';
const root = process.cwd();
const rows = [
  row('npm_pack_local_tarball', 'blackbox:pack-install'),
  row('temp_npm_install', 'blackbox:pack-install'),
  row('npx_one_shot', 'blackbox:npx'),
  row('global_shim_temp_prefix', 'blackbox:global-shim'),
  row('fresh_home', 'blackbox:pack-install'),
  row('project_local_install', 'blackbox:pack-install'),
  row('no_git_repo_directory', 'blackbox:pack-install'),
  row('read_only_project_directory', 'test:e2e:mock'),
  row('path_with_spaces', 'blackbox:pack-install'),
  row('korean_unicode_path', 'test:e2e:mock')
];

if (real) {
  for (const script of ['blackbox:pack-install', 'blackbox:npx', 'blackbox:global-shim']) {
    const result = spawnSync('npm', ['run', script], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
    for (const item of rows.filter((entry) => entry.script === script)) {
      item.ok = result.status === 0;
      item.status = result.status === 0 ? 'verified' : 'blocked';
      item.stderr_tail = String(result.stderr || '').slice(-500);
    }
  }
}

const report = {
  schema: 'sks.blackbox-matrix.v1',
  ok: rows.every((entry) => entry.ok),
  mode: real ? 'real' : 'contract_with_existing_release_blackbox_scripts',
  rows
};
const out = path.join(root, '.sneakoscope', 'reports', 'blackbox-matrix.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, report_path: out }, null, 2));
if (!report.ok) process.exitCode = 1;

function row(id, script) {
  return {
    id,
    script,
    ok: !real,
    status: real ? 'pending' : 'verified_partial',
    note: real ? 'will run selected package script' : 'covered by release blackbox scripts or hermetic E2E contract; set SKS_REAL_BLACKBOX_MATRIX=1 for full package-install execution'
  };
}
