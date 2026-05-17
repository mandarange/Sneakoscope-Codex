import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { exists, projectRoot, readJson, writeJsonAtomic } from '../core/fsx.mjs';
import { CODEX_ACCESS_TOKENS_DOCS_URL } from '../core/codex-app.mjs';
import { redactSecrets } from '../core/secret-redaction.mjs';
import { evaluateHookPayload } from '../core/hooks-runtime.mjs';
import { buildAllFeaturesSelftest, buildFeatureRegistry, validateFeatureRegistry, writeFeatureInventoryDocs } from '../core/feature-registry.mjs';

const flag = (args, name) => args.includes(name);

export async function featuresCommand(sub = 'list', args = []) {
  const action = sub || 'list';
  const root = await projectRoot();
  if (action === 'list' || action === 'status' || action === 'registry') {
    const registry = await buildFeatureRegistry({ root });
    if (flag(args, '--json')) return console.log(JSON.stringify(registry, null, 2));
    printFeatureRegistrySummary(registry);
    if (!registry.coverage.ok) process.exitCode = 1;
    return;
  }
  if (action === 'check') {
    const registry = await buildFeatureRegistry({ root });
    const coverage = validateFeatureRegistry(registry);
    const result = { schema: 'sks.feature-registry-check.v1', generated_at: registry.generated_at, ok: coverage.ok, coverage };
    if (flag(args, '--json')) console.log(JSON.stringify(result, null, 2));
    else printFeatureCoverage(coverage);
    if (!coverage.ok) process.exitCode = 1;
    return;
  }
  if (action === 'inventory') {
    const writeDocs = flag(args, '--write-docs');
    const result = writeDocs
      ? await writeFeatureInventoryDocs({ root })
      : { ok: true, registry: await buildFeatureRegistry({ root }), path: path.join(root, 'docs', 'feature-inventory.md') };
    if (flag(args, '--json')) return console.log(JSON.stringify({ ok: result.ok, path: result.path, coverage: result.registry.coverage }, null, 2));
    if (writeDocs) console.log(`Feature inventory written: ${path.relative(root, result.path)}`);
    printFeatureRegistrySummary(result.registry);
    if (!result.registry.coverage.ok) process.exitCode = 1;
    return;
  }
  console.error('Usage: sks features list|check|inventory [--json] [--write-docs]');
  process.exitCode = 1;
}

export async function allFeaturesCommand(sub = 'selftest', args = []) {
  const action = sub || 'selftest';
  if (action !== 'selftest') {
    console.error('Usage: sks all-features selftest --mock [--execute-fixtures] [--json]');
    process.exitCode = 1;
    return;
  }
  const root = await projectRoot();
  const registry = await buildFeatureRegistry({ root });
  const result = buildAllFeaturesSelftest(registry, { executeFixtures: flag(args, '--execute-fixtures'), strictArtifacts: flag(args, '--strict-artifacts'), root });
  if (flag(args, '--json')) console.log(JSON.stringify(result, null, 2));
  else {
    console.log('SKS all-features selftest');
    console.log(`Status: ${result.status}`);
    for (const check of result.checks) console.log(`- ${check.ok ? 'ok' : 'blocked'} ${check.id}${check.blockers.length ? `: ${check.blockers.join(', ')}` : ''}`);
    if (result.note) console.log(`\n${result.note}`);
  }
  if (!result.ok) process.exitCode = 1;
}

export async function hooksCommand(sub = 'explain', args = []) {
  const action = sub || 'explain';
  const root = await projectRoot();
  if (action === 'status') {
    const report = await hooksStatusReport(root);
    if (flag(args, '--json')) return console.log(JSON.stringify(report, null, 2));
    console.log(`Hooks: ${report.ok ? 'ok' : 'missing'}`);
    for (const file of report.hooks_files) console.log(`- ${file.path}: ${file.exists ? 'present' : 'missing'}`);
    return;
  }
  if (action === 'trust-report') {
    const report = await hooksTrustReport(root);
    if (flag(args, '--json')) return console.log(JSON.stringify(report, null, 2));
    console.log(`Hooks trust report: ${report.ok ? 'ok' : 'blocked'}`);
    for (const event of report.events) console.log(`- ${event.event}: ${event.command}`);
    return;
  }
  if (action === 'replay') {
    const fixture = args.find((arg) => !String(arg).startsWith('--'));
    const report = await hooksReplayReport(fixture);
    if (flag(args, '--json')) return console.log(JSON.stringify(report, null, 2));
    console.log(`Hook replay: ${report.ok ? 'ok' : 'blocked'} ${report.event || 'unknown'}`);
    if (report.decision) console.log(`Decision: ${report.decision}`);
    return;
  }
  if (action !== 'explain') {
    console.error('Usage: sks hooks explain|status|trust-report|replay <fixture.json> [--json]');
    process.exitCode = 1;
    return;
  }
  const report = hooksExplainReport();
  if (flag(args, '--json')) return console.log(JSON.stringify(report, null, 2));
  console.log('SKS hooks explain\n');
  console.log(`Status: ${report.status}`);
  console.log(`Feature key: ${report.feature_key}`);
  console.log(`Config paths: ${report.config_paths.join(', ')}`);
  console.log(`Events: ${report.events.join(', ')}`);
  console.log(`Handlers: ${report.handlers.supported.join(', ')} supported; ${report.handlers.parsed_but_skipped.join(', ')} parsed but skipped`);
  console.log('\nPolicies:');
  for (const policy of report.sks_policies) console.log(`- ${policy}`);
  console.log('\nSources:');
  for (const source of report.sources) console.log(`- ${source.title}: ${source.url}`);
}

async function hooksStatusReport(root) {
  const files = [
    path.join(os.homedir(), '.codex', 'hooks.json'),
    path.join(root, '.codex', 'hooks.json')
  ];
  const hooksFiles = [];
  for (const file of files) {
    hooksFiles.push({ path: file, exists: await exists(file) });
  }
  return {
    schema: 'sks.hooks-status.v1',
    hooks_files: hooksFiles,
    ok: hooksFiles.some((file) => file.exists)
  };
}

async function hooksTrustReport(root) {
  const status = await hooksStatusReport(root);
  return redactSecrets({
    schema: 'sks.hooks-trust-report.v1',
    hooks_files: status.hooks_files.map((file) => file.path),
    events: [
      { event: 'PreToolUse', command: 'sks hook pre-tool', writes: ['.sneakoscope/bus/tool-events.jsonl'], network: false, secret_policy: 'redacted', risk: 'medium' },
      { event: 'PermissionRequest', command: 'sks hook permission-request', writes: ['.sneakoscope/state'], network: false, secret_policy: 'redacted', risk: 'medium' },
      { event: 'UserPromptSubmit', command: 'sks hook user-prompt-submit', writes: ['.sneakoscope/missions'], network: false, secret_policy: 'redacted', risk: 'medium' },
      { event: 'Stop', command: 'sks hook stop', writes: ['.sneakoscope/missions', '.sneakoscope/proof'], network: false, secret_policy: 'redacted', risk: 'high' }
    ],
    ok: true,
    warnings: status.ok ? [] : ['no hooks.json file found in project or user config']
  });
}

async function hooksReplayReport(fixturePath) {
  if (!fixturePath) return { schema: 'sks.hooks-replay.v1', ok: false, reason: 'fixture_required' };
  const absolute = path.resolve(fixturePath);
  const fixture = await readJson(absolute, {});
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-hooks-replay-'));
  const payload = { ...(fixture.payload || fixture), cwd: tempRoot };
  const state = fixture.state || {};
  if (state.mission_id && fixture.proof) {
    await writeJsonAtomic(path.join(tempRoot, '.sneakoscope', 'missions', state.mission_id, 'completion-proof.json'), fixture.proof);
  }
  const event = fixture.event || fixture.hook_event_name || fixture.name || 'unknown';
  const hookName = normalizeReplayHookName(event);
  const runtime = await evaluateHookPayload(hookName, payload, { root: tempRoot, state });
  const decision = runtime.decision || runtime.permissionDecision || (runtime.continue === true ? 'continue' : 'continue');
  const expected = await readExpectedReplay(absolute);
  const comparable = {
    decision,
    permissionDecision: runtime.permissionDecision || null,
    reason: runtime.reason || 'fixture_safe',
    gate: runtime.gate || runtime.hookSpecificOutput?.gate || null,
    missing: runtime.missing || runtime.hookSpecificOutput?.missing || [],
    issues: runtime.issues || runtime.hookSpecificOutput?.issues || runtime.missing || [],
    continue: runtime.continue,
    secret_policy: 'redacted'
  };
  const match = expected ? matchHookExpected(comparable, expected) : { ok: decision !== 'block' && decision !== 'deny', failures: [] };
  const matchesExpected = expected ? match.ok : null;
  const ok = match.ok;
  return redactSecrets({
    schema: 'sks.hooks-replay.v1',
    ok,
    event,
    hook: hookName,
    command: payload.command || payload.tool_input?.command || payload.toolInput?.command || payload.input?.command || '',
    decision,
    permissionDecision: comparable.permissionDecision,
    reason: comparable.reason,
    gate: comparable.gate,
    missing: comparable.missing,
    issues: comparable.issues,
    continue: comparable.continue,
    matches_expected: matchesExpected,
    expected_failures: match.failures,
    secret_policy: 'redacted'
  });
}

function matchHookExpected(actual = {}, expected = {}) {
  const failures = [];
  if (expected.decision !== undefined && expected.decision !== actual.decision) failures.push(`decision:${actual.decision}`);
  if (expected.permissionDecision !== undefined && expected.permissionDecision !== actual.permissionDecision) failures.push(`permissionDecision:${actual.permissionDecision}`);
  if (expected.reason !== undefined && expected.reason !== actual.reason) failures.push('reason');
  if (expected.reason_contains !== undefined && !String(actual.reason || '').includes(expected.reason_contains)) failures.push('reason_contains');
  if (expected.gate !== undefined && expected.gate !== actual.gate) failures.push(`gate:${actual.gate}`);
  if (expected.continue !== undefined && expected.continue !== actual.continue) failures.push(`continue:${actual.continue}`);
  for (const item of expected.missing_contains || []) {
    if (!containsValue(actual.missing, item)) failures.push(`missing_contains:${item}`);
  }
  for (const item of expected.issues_contains || []) {
    if (!containsValue(actual.issues, item) && !containsValue(actual.missing, item) && !String(actual.reason || '').includes(item)) failures.push(`issues_contains:${item}`);
  }
  if (expected.secret_policy !== undefined && expected.secret_policy !== actual.secret_policy) failures.push(`secret_policy:${actual.secret_policy}`);
  return { ok: failures.length === 0, failures };
}

function containsValue(values, item) {
  const list = Array.isArray(values) ? values : [values].filter(Boolean);
  return list.some((value) => String(value || '').includes(item));
}

function normalizeReplayHookName(event = '') {
  const normalized = String(event || '').replace(/[_\s]+/g, '-').toLowerCase();
  if (normalized.includes('pretool') || normalized.includes('pre-tool')) return 'pre-tool';
  if (normalized.includes('permission')) return 'permission-request';
  if (normalized.includes('userprompt') || normalized.includes('user-prompt')) return 'user-prompt-submit';
  if (normalized.includes('posttool') || normalized.includes('post-tool')) return 'post-tool';
  if (normalized.includes('stop')) return 'stop';
  return normalized || 'pre-tool';
}

async function readExpectedReplay(fixturePath) {
  const expectedPath = path.join(path.dirname(fixturePath), 'expected', `${path.basename(fixturePath, '.json')}.expected.json`);
  if (!await exists(expectedPath)) return null;
  return readJson(expectedPath, null);
}

export function hooksExplainReport() {
  return {
    schema: 'sks.hooks-explain.v1',
    status: 'supported_by_official_docs_and_local_config',
    feature_key: 'features.hooks',
    deprecated_feature_alias: 'features.codex_hooks',
    config_paths: ['~/.codex/hooks.json', '~/.codex/config.toml', '<repo>/.codex/hooks.json', '<repo>/.codex/config.toml'],
    events: ['SessionStart', 'PreToolUse', 'PermissionRequest', 'PostToolUse', 'UserPromptSubmit', 'Stop'],
    handlers: {
      supported: ['command'],
      parsed_but_skipped: ['prompt', 'agent'],
      async_command_hooks: 'parsed_but_not_supported'
    },
    runtime_notes: [
      'Matching hooks from multiple files all run.',
      'Multiple matching command hooks for the same event are launched concurrently.',
      'Project-local hooks require a trusted project .codex layer.',
      'Repo-local hook commands should resolve from git root instead of assuming the session cwd.'
    ],
    sks_policies: [
      'secret_scan_policy',
      'directory_rule_policy',
      'db_safety_policy',
      'visual_claim_source_policy',
      'proof_required_policy',
      'codex_lb_health_policy'
    ],
    sources: [
      { title: 'OpenAI Codex Hooks', url: 'https://developers.openai.com/codex/hooks' },
      { title: 'OpenAI Codex Configuration Reference', url: 'https://developers.openai.com/codex/config-reference' },
      { title: 'OpenAI Codex Access Tokens', url: CODEX_ACCESS_TOKENS_DOCS_URL }
    ]
  };
}

function printFeatureRegistrySummary(registry) {
  console.log('SKS feature registry\n');
  console.log(`Schema:   ${registry.schema}`);
  console.log(`Features: ${registry.features.length}`);
  printFeatureCoverage(registry.coverage);
}

function printFeatureCoverage(coverage = {}) {
  console.log(`Coverage: ${coverage.ok ? 'ok' : 'blocked'} (${coverage.status || 'unknown'})`);
  for (const [kind, values] of Object.entries(coverage.unmapped || {})) {
    console.log(`- ${kind}: ${values.length ? values.join(', ') : 'none'}`);
  }
  if (coverage.blockers?.length) console.log(`Blockers: ${coverage.blockers.join(', ')}`);
}
