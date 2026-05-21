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
  'docs/hooks-pat.md',
  'docs/known-gaps.md',
  'docs/release-readiness.md'
];

const required = {
  'README.md': ['CHANGELOG.md', 'docs/release-readiness.md', 'gpt-image-2'],
  'CHANGELOG.md': ['1.12.0 Real Execution Closure', 'probe_only', 'live_capture_success', 'process_only_ephemeral'],
  'docs/computer-use-evidence.md': ['sks.computer-use-live-evidence.v1', 'probe_only', 'live_capture_blocked', 'local-only'],
  'docs/codex-lb.md': ['durable_env_file', 'durable_keychain', 'durable_launchctl', 'shell_profile', 'process_only_ephemeral'],
  'docs/codex-cli-compat.md': ['rust-v0.132.0', 'sks_zero_warning_disallowed', 'strict subset'],
  'docs/hooks-pat.md': ['strict subset', 'zero-warning'],
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
