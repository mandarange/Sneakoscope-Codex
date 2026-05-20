#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = readJson('package.json');
const reportDir = path.join(root, '.sneakoscope', 'reports');
const jsonPath = path.join(reportDir, 'release-readiness-1.0.7.json');
const mdPath = path.join(reportDir, 'release-readiness-1.0.7.md');

const checks = {
  hook_strict_subset: scriptContains('release:check', 'hooks:strict-subset-check'),
  codex_lb_persistence_truth: scriptContains('release:check', 'codex-lb:persistence-truth'),
  computer_use_live_evidence: scriptContains('release:check', 'computer-use:live-evidence'),
  docs_truthfulness: scriptContains('release:check', 'docs:truthfulness'),
  release_readiness: scriptContains('release:check', 'release:readiness')
};
const docs = runNodeScript('scripts/docs-truthfulness-check.mjs');
const remainingP0 = [];
if (pkg.version !== '1.0.7') remainingP0.push('package_version_not_1.0.7');
for (const [name, ok] of Object.entries(checks)) if (!ok) remainingP0.push(`${name}_gate_missing`);
if (docs.status !== 0) remainingP0.push('docs_truthfulness_failed');

const stamp = readJson('.sneakoscope/reports/release-check-stamp.json', null);
const report = {
  schema: 'sks.release-readiness.v1',
  generated_at: new Date().toISOString(),
  package: {
    name: pkg.name,
    version: pkg.version
  },
  hook_strict_subset: {
    status: checks.hook_strict_subset ? 'present' : 'missing'
  },
  codex_lb_setup_truthfulness: {
    status: checks.codex_lb_persistence_truth ? 'present' : 'missing',
    persistence_modes: ['durable_env_file', 'durable_keychain', 'durable_launchctl', 'shell_profile', 'process_only_ephemeral']
  },
  computer_use_evidence_mode_support: {
    status: checks.computer_use_live_evidence ? 'present' : 'missing',
    modes: ['probe_only', 'live_capture_attempted', 'live_capture_success', 'live_capture_blocked']
  },
  docs_truthfulness: {
    status: docs.status === 0 ? 'pass' : 'fail',
    stdout: trimOutput(docs.stdout)
  },
  release_gate_last_pass_stamp: stamp ? {
    package_version: stamp.package_version || null,
    generated_at: stamp.generated_at || null,
    source_digest: stamp.source_digest || null
  } : null,
  remaining_p0_gaps: remainingP0,
  ok: remainingP0.length === 0
};

fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(mdPath, renderMarkdown(report));
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;

function readJson(rel, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
  } catch (err) {
    if (arguments.length > 1) return fallback;
    throw err;
  }
}

function scriptContains(name, needle) {
  return String(pkg.scripts?.[name] || '').includes(needle);
}

function runNodeScript(rel) {
  return spawnSync(process.execPath, [rel], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, CI: 'true' },
    timeout: 30_000
  });
}

function trimOutput(text) {
  return String(text || '').slice(0, 4000);
}

function renderMarkdown(report) {
  return `# SKS 1.0.7 Release Readiness

- Schema: \`${report.schema}\`
- Package: \`${report.package.name}@${report.package.version}\`
- Hook strict subset: \`${report.hook_strict_subset.status}\`
- codex-lb persistence truth: \`${report.codex_lb_setup_truthfulness.status}\`
- Computer Use evidence modes: \`${report.computer_use_evidence_mode_support.status}\`
- Docs truthfulness: \`${report.docs_truthfulness.status}\`
- Remaining P0 gaps: ${report.remaining_p0_gaps.length ? report.remaining_p0_gaps.join(', ') : 'None'}

Computer Use live evidence remains opt-in and local-only. codex-lb process-only setup is reported as \`process_only_ephemeral\`, not durable persistence.
`;
}
