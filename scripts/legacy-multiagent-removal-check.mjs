#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = readJson('package.json');

const removedPaths = [
  'archive/legacy/legacy-main.0.9.13.mjs',
  'archive/legacy/maintenance-commands.0.9.13.mjs',
  'docs/goals/sks-1.14.1-scout-multisession-official-syntax-addendum.md',
  'src/core/scouts',
  'src/core/commands/scouts-command.ts',
  'src/core/commands/scouts-command.mjs',
  'src/commands/scouts.ts',
  'src/commands/scouts.mjs',
  'schemas/codex/scout-result.schema.json',
  'schemas/codex/no-scout-policy-report.schema.json',
  'src/core/agents/no-scout-policy.ts',
  'src/core/agents/no-scout-policy.mjs',
  'scripts/no-scout-policy-check.mjs'
];

const sourceFiles = [
  'src/cli/command-registry.ts',
  'src/cli/command-registry.mjs',
  'src/core/routes.ts',
  'src/core/routes.mjs',
  'src/core/proof/route-finalizer.ts',
  'src/core/proof/route-finalizer.mjs',
  'src/core/trust-kernel/route-contract.ts',
  'src/core/trust-kernel/route-contract.mjs',
  'src/core/trust-kernel/completion-contract.ts',
  'src/core/trust-kernel/completion-contract.mjs',
  'src/core/commands/status-command.ts',
  'src/core/commands/status-command.mjs',
  'README.md',
  'docs/native-agent-kernel.md',
  'docs/team-mode.md',
  'docs/research-mode.md',
  'docs/legacy-free-architecture.md',
  'docs/feature-fixtures.md',
  'docs/feature-inventory.md',
  'docs/completion-proof.md'
];

const forbidden = [
  { id: 'scouts_cli_command', re: /\bscouts?\s*:\s*entry\b|\bsks\s+scouts?\b|['"]--force-scouts['"]|['"]--legacy-scout['"]/i },
  { id: 'scout_runtime_import', re: /\brunFiveScoutIntake\b|\.\.\/scouts\/|\.\.\/core\/scouts\/|\bscout-proof-evidence\b|\bscout-gate\b/i },
  { id: 'scout_evidence_contract', re: /\bevidence\.scouts\b|\brequired\.scouts\b|\bscout_status\b|\bscouts_required\b/i },
  { id: 'manual_diagnostics_fallback', re: /manual (?:diagnostics|forensics)|legacy artifact comparison|legacy Scout/i }
];

const issues = [];

for (const rel of removedPaths) {
  if (fs.existsSync(path.join(root, rel))) issues.push({ type: 'path_present', path: rel });
}

for (const key of Object.keys(pkg.scripts || {})) {
  const value = String(pkg.scripts[key] || '');
  if (/^scouts?:|scouts?:/.test(key) || /\bsks(?:\.js)?\s+scouts?\b|\bnpm run scouts?:/.test(value)) {
    issues.push({ type: 'package_script_legacy_surface', script: key, value });
  }
}

for (const rel of sourceFiles) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) continue;
  const text = fs.readFileSync(full, 'utf8');
  for (const rule of forbidden) {
    if (rule.re.test(text)) issues.push({ type: 'forbidden_reference', rule: rule.id, path: rel });
  }
}

const result = {
  schema: 'sks.legacy-multiagent-removal.v1',
  ok: issues.length === 0,
  removed_paths_checked: removedPaths.length,
  source_files_checked: sourceFiles.filter((rel) => fs.existsSync(path.join(root, rel))).length,
  issues
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}
