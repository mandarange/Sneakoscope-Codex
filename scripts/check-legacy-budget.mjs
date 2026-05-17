#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const legacyPath = path.join(root, 'src', 'cli', 'legacy-main.mjs');
const registryPath = path.join(root, 'src', 'cli', 'command-registry.mjs');
const legacyText = fs.readFileSync(legacyPath, 'utf8');
const registryText = fs.readFileSync(registryPath, 'utf8');
const highValue = ['doctor', 'db', 'codex-app'];
const warnings = [];

for (const command of highValue) {
  const re = new RegExp(`${JSON.stringify(command).slice(1, -1)}['"]?\\s*:\\s*\\{[^}]*lazy:\\s*legacy`, 'm');
  if (re.test(registryText)) warnings.push(`${command}:legacy_lazy`);
}

const report = {
  schema: 'sks.legacy-budget.v1',
  ok: warnings.length === 0,
  legacy_main_lines: legacyText.split(/\r?\n/).length,
  legacy_command_count: (registryText.match(/lazy:\s*legacy/g) || []).length,
  high_value_warnings: warnings,
  policy: {
    version: '0.9.13',
    mode: 'warn_for_remaining_legacy',
    next: '0.9.14 may hard-block selected high-value legacy fallbacks'
  }
};

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(2);
