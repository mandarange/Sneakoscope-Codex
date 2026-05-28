#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const root = path.resolve(readOption('--root', process.cwd()));
const configPath = path.resolve(readOption('--config', path.join(root, '.codex', 'config.toml')));
const json = args.includes('--json');

const report = {
  schema: 'sks.codex-config-load-probe.v1',
  generated_at: new Date().toISOString(),
  root,
  config_path: configPath,
  ok: false,
  checks: [],
  blockers: []
};

await check('node_read', async () => {
  const text = await fs.readFile(configPath, 'utf8');
  return { bytes: Buffer.byteLength(text) };
});

const child = spawnSync(process.execPath, ['-e', 'require("fs").readFileSync(process.argv[1], "utf8")', configPath], {
  cwd: root,
  encoding: 'utf8'
});
report.checks.push({
  name: 'spawned_child_read',
  ok: child.status === 0,
  exit_code: child.status,
  stderr: child.stderr || ''
});
if (child.status !== 0) report.blockers.push(classify(child.stderr || `exit_${child.status}`));

report.ok = report.checks.every((check) => check.ok) && report.blockers.length === 0;
if (json) console.log(JSON.stringify(report, null, 2));
else console.log(report.ok ? `Codex config load probe ok: ${configPath}` : `Codex config load probe failed: ${report.blockers.join(', ')}`);
if (!report.ok) process.exitCode = 1;

async function check(name, fn) {
  try {
    report.checks.push({ name, ok: true, detail: await fn() });
  } catch (err) {
    report.checks.push({ name, ok: false, error: { code: err?.code || '', message: err?.message || String(err) } });
    report.blockers.push(classify(err));
  }
}

function classify(err) {
  const code = typeof err === 'string' ? err : String(err?.code || err?.message || err || 'unknown');
  if (/EPERM/.test(code)) return 'EPERM';
  if (/EACCES/.test(code)) return 'EACCES';
  if (/ENOENT/.test(code)) return 'ENOENT';
  return code;
}

function readOption(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}
