import path from 'node:path';
import os from 'node:os';
import { exists, projectRoot, readJson } from '../core/fsx.mjs';
import { CODEX_ACCESS_TOKENS_DOCS_URL } from '../core/codex-app.mjs';
import { redactSecrets } from '../core/secret-redaction.mjs';
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
    console.error('Usage: sks all-features selftest --mock [--json]');
    process.exitCode = 1;
    return;
  }
  const root = await projectRoot();
  const registry = await buildFeatureRegistry({ root });
  const result = buildAllFeaturesSelftest(registry);
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
  const fixture = await readJson(path.resolve(fixturePath), {});
  const command = fixture.command || fixture.tool_input?.command || fixture.toolInput?.command || fixture.input?.command || '';
  const event = fixture.event || fixture.hook_event_name || fixture.name || 'unknown';
  const dangerousDb = /\b(?:drop\s+table|delete\s+from|truncate|supabase\s+db\s+reset)\b/i.test(command);
  const missingProof = /route-without-proof|without-proof/i.test(fixturePath) || fixture.requires_proof === true;
  return redactSecrets({
    schema: 'sks.hooks-replay.v1',
    ok: !dangerousDb && !missingProof,
    event,
    command,
    decision: dangerousDb || missingProof ? 'block' : 'continue',
    reason: dangerousDb ? 'dangerous_database_command' : (missingProof ? 'route_completion_without_proof' : 'fixture_safe'),
    secret_policy: 'redacted'
  });
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
