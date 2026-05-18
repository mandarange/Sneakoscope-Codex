#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const failures = [];
const warnings = [];

runGate('pipeline-budget:check');
runGate('pipeline-runtime:check');
checkFacade('src/core/pipeline-runtime.mjs', 300);
checkLargeFiles();

if (warnings.length) {
  console.error('Architecture warnings:');
  for (const warning of warnings) console.error(`- ${warning}`);
}
if (failures.length) {
  console.error('Architecture check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Architecture check passed');

function runGate(script) {
  const result = spawnSync('npm', ['run', script], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  if (result.status !== 0) failures.push(`${script}: ${result.stderr || result.stdout}`.trim());
}

function checkFacade(relPath, maxLines) {
  const file = path.join(root, relPath);
  if (!fs.existsSync(file)) return failures.push(`${relPath}: missing`);
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/).length;
  if (lines > maxLines) failures.push(`${relPath}: line count ${lines} > ${maxLines}`);
  if (/from ['"].*\b(team|qa|research|ppt|image-ux-review|db|gx)\b/i.test(text)) failures.push(`${relPath}: imports route implementation domains directly`);
}

function checkLargeFiles() {
  const files = [];
  walk(path.join(root, 'src'), files);
  for (const file of files) {
    const relPath = path.relative(root, file).split(path.sep).join('/');
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).length;
    if (lines > 3000) failures.push(`${relPath}: handwritten file ${lines} lines > 3000 split-review gate`);
    else if (lines > 1500) warnings.push(`${relPath}: ${lines} lines; extraction recommended before adding substantial unrelated logic`);
  }
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file, out);
    else if (entry.isFile() && /\.(mjs|js)$/.test(entry.name)) out.push(file);
  }
}
