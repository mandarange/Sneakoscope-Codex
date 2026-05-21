#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'README.md',
  'CHANGELOG.md',
  'docs/computer-use-evidence.md',
  'docs/codex-lb.md',
  'docs/codex-cli-compat.md',
  'docs/official-docs-compat.md',
  'docs/hooks-pat.md',
  'docs/known-gaps.md',
  'docs/release-readiness.md'
];

const required = {
  'README.md': ['CHANGELOG.md', 'docs/release-readiness.md', 'gpt-image-2'],
  'CHANGELOG.md': ['1.14.0', 'DFix Extreme Speed Kernel', 'hook trust doctor', 'warning-zero'],
  'docs/computer-use-evidence.md': ['sks.computer-use-live-evidence.v1', 'probe_only', 'live_capture_blocked', 'local-only'],
  'docs/codex-lb.md': ['durable_env_file', 'durable_keychain', 'durable_launchctl', 'shell_profile', 'process_only_ephemeral'],
  'docs/codex-cli-compat.md': ['rust-v0.133.0', 'goals_default_enabled', 'permission_profiles_requirements', 'SubagentStart', 'sks_zero_warning_disallowed', 'strict subset'],
  'docs/official-docs-compat.md': ['official-docs:compat', 'rust-v0.133.0', 'gpt-image-2', 'input_fidelity', 'additionalProperties:false'],
  'docs/hooks-pat.md': ['SubagentStop', 'strict subset', 'zero-warning'],
  'docs/known-gaps.md': ['No P0', 'P1'],
  'docs/release-readiness.md': ['sks.release-readiness.v1', 'release:readiness', 'official-docs:compat']
};

const forbidden = [
  /Computer Use is always available/i,
  /live evidence is guaranteed/i,
  /Browser Use evidence is Computer Use evidence/i,
  /process-only setup is durable/i,
  /screenshots are published to shared TriWiki automatically/i
];

const results = [];
for (const file of files) {
  const full = path.join(root, file);
  const text = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
  const missing = (required[file] || []).filter((needle) => !text.includes(needle));
  const forbiddenMatches = forbidden.filter((pattern) => pattern.test(text)).map(String);
  results.push({
    file,
    ok: Boolean(text) && missing.length === 0 && forbiddenMatches.length === 0,
    missing,
    forbidden: forbiddenMatches
  });
}

const ok = results.every((row) => row.ok);
console.log(JSON.stringify({
  schema: 'sks.docs-truthfulness-check.v1',
  ok,
  results
}, null, 2));
if (!ok) process.exitCode = 1;
