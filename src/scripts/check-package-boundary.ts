#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const issues = [];

const build = spawnSync(npmBin, ['run', 'build'], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
if (build.status !== 0) issues.push(`build_failed:${tail(build.stderr || build.stdout)}`);

const pack = spawnSync(npmBin, ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  cwd: root,
  encoding: 'utf8',
  stdio: 'pipe',
  env: { ...process.env, npm_config_cache: path.join(os.tmpdir(), 'sks-package-boundary-cache') }
});
if (pack.status !== 0) issues.push(`pack_failed:${tail(pack.stderr || pack.stdout)}`);

let files = [];
if (pack.status === 0) {
  try {
    files = JSON.parse(pack.stdout)[0].files.map((file) => file.path);
  } catch (err) {
    issues.push(`pack_json:${err.message}`);
  }
}

for (const required of ['package.json', 'README.md', 'LICENSE', 'dist/bin/sks.js', 'dist/cli/command-registry.js', 'schemas/codex/image-ux-issue-ledger.schema.json', 'schemas/codex/ux-review-callout-extraction.schema.json']) {
  if (!files.includes(required)) issues.push(`packed_missing:${required}`);
}
const ALLOWED_PACKED_SCRIPTS = new Set();
for (const forbidden of files.filter((file) => /^(src|scripts|test|\.sneakoscope|\.codex|\.agents)\//.test(file) && !ALLOWED_PACKED_SCRIPTS.has(file))) {
  issues.push(`packed_forbidden:${forbidden}`);
}
for (const forbidden of files.filter((file) => file.endsWith('.mjs') && !ALLOWED_PACKED_SCRIPTS.has(file))) {
  issues.push(`packed_mjs_forbidden:${forbidden}`);
}

const importIssues = checkImportClosure(path.join(root, 'dist'));
issues.push(...importIssues);

const result = {
  schema: 'sks.package-boundary-check.v1',
  ok: issues.length === 0,
  files: files.length,
  bin: 'dist/bin/sks.js',
  import_closure_issues: importIssues,
  issues
};
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;

function checkImportClosure(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return ['dist_missing'];
  for (const file of walk(dir)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const spec of importSpecs(text)) {
      if (!spec.startsWith('.')) continue;
      const resolved = path.resolve(path.dirname(file), spec);
      const candidates = [resolved, `${resolved}.js`, `${resolved}.mjs`, path.join(resolved, 'index.js'), path.join(resolved, 'index.mjs')];
      if (!candidates.some((candidate) => fs.existsSync(candidate))) {
        out.push(`missing_import:${path.relative(root, file)}->${spec}`);
      }
    }
  }
  return out;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file, out);
    else if (entry.isFile() && /\.(mjs|js)$/.test(entry.name)) out.push(file);
  }
  return out;
}

function importSpecs(text) {
  const specs = [];
  text = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const re = /\bimport\s*(?:\([^)]*?['"]([^'"]+)['"]\)|(?:[^'"]*?\sfrom\s*)?['"]([^'"]+)['"])/g;
  let match;
  while ((match = re.exec(text))) {
    const previous = text[match.index - 1] || '';
    if (previous === '"' || previous === "'" || previous === '`') continue;
    specs.push(match[1] || match[2]);
  }
  return specs.filter(Boolean);
}

function tail(value) {
  return String(value || '').slice(-500).replace(/\s+/g, ' ').trim();
}
