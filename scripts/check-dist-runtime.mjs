#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = path.join(root, 'dist');
const issues = [];

if (!fs.existsSync(distRoot)) issues.push('dist_missing');
requiredFile('dist/bin/sks.js');
requiredFile('dist/cli/command-registry.js');
requiredFile('dist/build-manifest.json');

const bin = path.join(root, 'dist/bin/sks.js');
if (fs.existsSync(bin) && (fs.statSync(bin).mode & 0o111) === 0) issues.push('bin_not_executable:dist/bin/sks.js');

if (fs.existsSync(distRoot)) {
  for (const file of walk(distRoot)) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    if (rel.endsWith('.mjs')) issues.push(`dist_mjs:${rel}`);
    if (!rel.endsWith('.js')) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (text.includes('contract_only')) issues.push(`contract_only:${rel}`);
    if (/from\s+['"][^'"]+\.mjs['"]|import\(\s*['"][^'"]+\.mjs['"]\s*\)/.test(text)) {
      issues.push(`imports_mjs:${rel}`);
    }
  }
}

const result = {
  schema: 'sks.dist-runtime-check.v1',
  ok: issues.length === 0,
  issues
};
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;

function requiredFile(rel) {
  if (!fs.existsSync(path.join(root, rel))) issues.push(`missing:${rel}`);
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file, out);
    else if (entry.isFile()) out.push(file);
  }
  return out;
}
