import path from 'node:path';
import { projectRoot } from '../core/fsx.mjs';
import { CODEX_ACCESS_TOKENS_DOCS_URL } from '../core/codex-app.mjs';
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

export function hooksCommand(sub = 'explain', args = []) {
  const action = sub || 'explain';
  if (action !== 'explain' && action !== 'status') {
    console.error('Usage: sks hooks explain [--json]');
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
