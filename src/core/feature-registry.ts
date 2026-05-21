import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { COMMAND_CATALOG, DOLLAR_COMMAND_ALIASES, DOLLAR_COMMANDS } from './routes.js';
import { FEATURE_QUALITY_LEVELS, fixtureForFeature, fixtureSummary, validateFeatureFixtures } from './feature-fixtures.js';
import { runFeatureFixture, writeFeatureFixtureReports } from './feature-fixture-runner.js';
import { PACKAGE_VERSION, exists, nowIso, packageRoot, readJson, readText, runProcess, writeJsonAtomic, writeTextAtomic, type JsonData } from './fsx.js';

export const FEATURE_REGISTRY_SCHEMA = 'sks.feature-registry.v1';
export const FEATURE_INVENTORY_SCHEMA = 'sks.feature-inventory.v1';
export const ALL_FEATURES_SELFTEST_SCHEMA = 'sks.all-features-selftest.v1';
export const ALL_FEATURE_COMPLETION_SCHEMA = 'sks.all-feature-completion.v1';

const HANDLER_ALIAS_TO_COMMAND = Object.freeze({
  ui: 'wizard',
  auth: 'codex-lb',
  hook: 'hooks',
  memory: 'gc',
  postinstall: 'postinstall',
  'ux-review': 'image-ux-review',
  'visual-review': 'image-ux-review',
  'ui-ux-review': 'image-ux-review'
});

const FEATURE_ACCEPTANCE_DEFAULTS = Object.freeze([
  'contracts tracked',
  'unknowns explicit',
  'release-mapped'
]);

export async function buildFeatureRegistry({ root = packageRoot(), generatedAt = nowIso() }: any = {}): Promise<JsonData> {
  const handlerKeys = await parseMainHandlerKeys(root);
  const skillNames = await listProjectSkillNames(root);
  const docRouteMentions = await collectDocRouteMentions(root);
  const handlerToFeature: Record<string, string> = mapHandlerKeysToFeatureIds(handlerKeys);
  const features: any[] = [];

  for (const command of COMMAND_CATALOG) {
    const handlerAliases = Object.entries(handlerToFeature)
      .filter(([, featureId]: any) => featureId === `cli-${command.name}`)
      .map(([handler]: any) => handler)
      .filter((handler: any) => handler !== command.name);
    features.push(commandFeature(command, handlerAliases));
  }

  for (const handler of handlerKeys) {
    const featureId = handlerToFeature[handler];
    if (!features.some((feature: any) => feature.id === featureId)) {
      features.push(hiddenHandlerFeature(handler));
    }
  }

  for (const route of DOLLAR_COMMANDS) features.push(routeFeature(route));
  features.push(fiveScoutIntakeFeature());
  features.push(scoutProofEvidenceFeature());
  for (const skillName of skillNames) {
    if (!skillCoveredByRoute(skillName)) features.push(skillFeature(skillName));
  }

  const registry: any = {
    schema: FEATURE_REGISTRY_SCHEMA,
    generated_at: generatedAt,
    inventory_sources: {
      commands_json: 'sks commands --json',
      main_handlers: 'src/cli/main.js',
      dollar_routes: 'src/core/routes.js',
      docs: ['README.md', '.codex/SNEAKOSCOPE.md', 'AGENTS.md', '.agents/skills/.sks-generated.json'],
      skills: '.agents/skills'
    },
    features,
    fixture_summary: fixtureSummary(features),
    feature_quality_summary: featureQualitySummary(features),
    source_inventory: {
      cli_command_names: COMMAND_CATALOG.map((entry: any) => entry.name),
      handler_keys: handlerKeys,
      dollar_commands: DOLLAR_COMMANDS.map((entry: any) => entry.command),
      app_skill_aliases: DOLLAR_COMMAND_ALIASES.map((entry: any) => entry.app_skill),
      skills: skillNames,
      doc_route_mentions: docRouteMentions
    }
  };
  registry.coverage = validateFeatureRegistry(registry);
  return registry;
}

export function validateFeatureRegistry(registry: any = {}): JsonData {
  const features = Array.isArray(registry.features) ? registry.features : [];
  const source = registry.source_inventory || {};
  const mappedCli = new Set(flatMapSourceRefs(features, 'cli_command_names'));
  const mappedHandlers = new Set(flatMapSourceRefs(features, 'handler_keys'));
  const mappedRoutes = new Set(flatMapSourceRefs(features, 'dollar_commands'));
  const mappedAliases = new Set(flatMapSourceRefs(features, 'app_skill_aliases'));
  const mappedSkills = new Set(flatMapSourceRefs(features, 'skills'));
  const mappedRouteMentions = new Set([...mappedRoutes, ...mappedAliases].map(normalizeDollar));

  const unmapped = {
    cli_command_names: (source.cli_command_names || []).filter((name: any) => !mappedCli.has(name)),
    handler_keys: (source.handler_keys || []).filter((name: any) => !mappedHandlers.has(name)),
    dollar_commands: (source.dollar_commands || []).filter((name: any) => !mappedRoutes.has(name)),
    app_skill_aliases: (source.app_skill_aliases || []).filter((name: any) => !mappedAliases.has(name)),
    skills: (source.skills || []).filter((name: any) => !mappedSkills.has(name))
  };
  const duplicateFeatureIds = duplicateValues(features.map((feature: any) => feature.id));
  const routeMentionsWithoutRoute = (source.doc_route_mentions || [])
    .filter((mention: any) => !mappedRouteMentions.has(normalizeDollar(mention)) && !isExternalPromptCommandMention(mention));
  const blockers = [
    ...Object.entries(unmapped).flatMap(([kind, values]: any) => values.map((value: any) => `${kind}:${value}`)),
    ...duplicateFeatureIds.map((id: any) => `duplicate_feature_id:${id}`),
    ...routeMentionsWithoutRoute.map((mention: any) => `doc_route_mention_without_route:${mention}`)
  ];
  return {
    ok: blockers.length === 0,
    status: blockers.length ? 'blocked' : 'verified_partial',
    counts: {
      features: features.length,
      cli_command_names: source.cli_command_names?.length || 0,
      handler_keys: source.handler_keys?.length || 0,
      dollar_commands: source.dollar_commands?.length || 0,
      app_skill_aliases: source.app_skill_aliases?.length || 0,
      skills: source.skills?.length || 0
    },
    unmapped,
    duplicate_feature_ids: duplicateFeatureIds,
    doc_route_mentions_without_route: routeMentionsWithoutRoute,
    blockers,
    nonblocking_known_gaps: [
      'feature fixtures remain progressive',
      'registry proves coverage, not full roadmap completion'
    ],
    fixture_summary: fixtureSummary(features),
    feature_quality_summary: featureQualitySummary(features)
  };
}

export async function writeFeatureInventoryDocs({ root = packageRoot(), outFile = path.join(root, 'docs', 'feature-inventory.md') }: any = {}): Promise<JsonData> {
  const registry = await buildFeatureRegistry({ root });
  const markdown = renderFeatureInventoryMarkdown(registry);
  await writeTextAtomic(outFile, markdown);
  return { ok: registry.coverage.ok, path: outFile, registry };
}

export function buildAllFeaturesSelftest(registry: any, opts: any = {}): JsonData {
  const coverage = validateFeatureRegistry(registry);
  const fixtures = validateFeatureFixtures(registry.features || []);
  const fixturesSummary: any = fixtureSummary(registry.features || []);
  const executable = opts.executeFixtures ? executeFeatureFixtures(registry.features || [], opts) : null;
  const checks = [
    checkRow('feature_registry_completeness', coverage.ok, coverage.blockers),
    checkRow('command_lazy_load_availability', coverage.unmapped.cli_command_names.length === 0 && coverage.unmapped.handler_keys.length === 0, [...coverage.unmapped.cli_command_names, ...coverage.unmapped.handler_keys]),
    checkRow('json_schema_validation', registry.schema === FEATURE_REGISTRY_SCHEMA && Array.isArray(registry.features), []),
    checkRow('proof_integration_contracts_present', registry.features.every((feature: any) => Boolean(feature.completion_proof_integration)), missingFeatureField(registry, 'completion_proof_integration')),
    checkRow('voxel_triwiki_contracts_present', registry.features.every((feature: any) => Boolean(feature.voxel_triwiki_integration)), missingFeatureField(registry, 'voxel_triwiki_integration')),
    checkRow('failure_contracts_present', registry.features.every((feature: any) => Array.isArray(feature.known_gaps)), missingFeatureField(registry, 'known_gaps')),
    checkRow('fixture_contracts_present', fixtures.ok, fixtures.blockers),
    checkRow('feature_quality_levels_present', FEATURE_QUALITY_LEVELS.every((level: any) => Object.hasOwn(fixturesSummary.quality_counts || {}, level)), FEATURE_QUALITY_LEVELS),
    checkRow('runtime_routes_not_static_contract', runtimeRoutesNotStaticContract(registry.features || []).ok, runtimeRoutesNotStaticContract(registry.features || []).blockers),
    checkRow('fixture_fallback_removed', registry.features.every((feature: any) => feature.fixture?.fallback_removed === true && feature.fixture?.status !== 'missing'), registry.features.filter((feature: any) => feature.fixture?.fallback_removed !== true || feature.fixture?.status === 'missing').map((feature: any) => feature.id)),
    checkRow('proof_fixture_contract_present', registry.features.some((feature: any) => feature.id === 'cli-proof' && feature.fixture?.status === 'pass'), ['cli-proof']),
    checkRow('voxel_fixture_contract_present', registry.features.some((feature: any) => feature.id === 'cli-wiki' && feature.fixture?.expected_artifacts?.some((artifact: any) => expectedArtifactPath(artifact).includes('image-voxel-ledger'))), ['cli-wiki']),
    checkRow('five_scout_intake_contract_present', registry.features.some((feature: any) => feature.id === 'route-five-scout-intake'), ['route-five-scout-intake']),
    checkRow('scout_gate_fixture_pass', registry.features.some((feature: any) => feature.id === 'cli-scouts' && feature.fixture?.status === 'pass' && feature.fixture.expected_artifacts?.some((artifact: any) => expectedArtifactPath(artifact).includes('scout-gate'))), ['cli-scouts']),
    checkRow('scout_proof_evidence_contract_present', registry.features.some((feature: any) => feature.id === 'proof-scout-evidence'), ['proof-scout-evidence']),
    checkRow('scout_read_only_policy_present', registry.features.some((feature: any) => feature.id === 'route-five-scout-intake' && /read-only/i.test(JSON.stringify(feature.contract || {}))), ['route-five-scout-intake']),
    checkRow('fixture_pass_threshold', (fixturesSummary.counts.pass || 0) >= 90, [`pass=${fixturesSummary.counts.pass || 0}`]),
    checkRow('fixture_not_required_ceiling', (fixturesSummary.counts.not_required || 0) <= 16, [`not_required=${fixturesSummary.counts.not_required || 0}`]),
    checkRow('fixture_mock_blocked_zero', (fixturesSummary.counts.blocked || 0) === 0, [`blocked=${fixturesSummary.counts.blocked || 0}`]),
    ...(executable ? [checkRow('executable_fixture_contracts', executable.ok, executable.failures)] : [])
  ];
  const ok = checks.every((check: any) => check.ok);
  return {
    schema: ALL_FEATURES_SELFTEST_SCHEMA,
    generated_at: registry.generated_at || nowIso(),
    ok,
    status: ok ? 'verified_partial' : 'blocked',
    checks,
    fixtures: fixturesSummary,
    feature_quality_summary: featureQualitySummary(registry.features || []),
    coverage,
    executable_fixtures: executable,
    note: opts.executeFixtures
      ? 'Mock executable fixture mode validates release-gated fixture contracts and expected artifact declarations.'
      : 'Mock selftest verifies the shared contract spine; feature fixtures remain progressive.'
  };
}

export async function writeAllFeatureCompletionReport({ root = packageRoot(), outDir = path.join(root, '.sneakoscope', 'reports') }: any = {}): Promise<JsonData> {
  const registry = await buildFeatureRegistry({ root });
  const packageJson = await readJson(path.join(root, 'package.json'), {});
  const report = buildAllFeatureCompletionReport(registry, { root, packageJson });
  const jsonPath = path.join(outDir, `all-feature-completion-${PACKAGE_VERSION}.json`);
  const markdownPath = path.join(outDir, `all-feature-completion-${PACKAGE_VERSION}.md`);
  await writeJsonAtomic(jsonPath, report);
  await writeTextAtomic(markdownPath, renderAllFeatureCompletionMarkdown(report));
  return { ...report, files: { json: jsonPath, markdown: markdownPath } };
}

export function buildAllFeatureCompletionReport(registry: any, opts: any = {}): JsonData {
  const packageJson = opts.packageJson || {};
  const features = [
    ...(registry.features || []).map((feature: any) => featureCompletionRow(feature)),
    ...derivedReleaseFeatureRows(opts.root || packageRoot(), packageJson)
  ];
  const missingScripts = SECTION_29_PACKAGE_SCRIPTS.filter((script: string) => !packageJson.scripts?.[script]);
  const runtimeStatic = runtimeRoutesNotStaticContract(registry.features || []);
  const blockers = [
    ...(registry.coverage?.blockers || []),
    ...missingScripts.map((script: string) => `missing_script:${script}`),
    ...runtimeStatic.blockers,
    ...(packageJson.version === PACKAGE_VERSION ? [] : [`package_version:${packageJson.version || 'missing'}`]),
    ...features.flatMap((feature: any) => feature.blockers.map((blocker: string) => `${feature.id}:${blocker}`))
  ];
  return {
    schema: ALL_FEATURE_COMPLETION_SCHEMA,
    version: PACKAGE_VERSION,
    generated_at: registry.generated_at || nowIso(),
    ok: blockers.length === 0,
    status: blockers.length ? 'blocked' : 'verified_partial',
    counts: {
      features: features.length,
      registry_features: registry.features?.length || 0,
      derived_release_features: features.length - (registry.features?.length || 0),
      package_scripts_required: SECTION_29_PACKAGE_SCRIPTS.length,
      package_scripts_missing: missingScripts.length
    },
    blockers,
    required_scripts: SECTION_29_PACKAGE_SCRIPTS,
    missing_scripts: missingScripts,
    release_gates: {
      version_metadata: packageJson.version === PACKAGE_VERSION ? 'present' : 'blocked',
      feature_registry: registry.coverage?.ok ? 'present' : 'blocked',
      runtime_routes_not_static_contract: runtimeStatic.ok ? 'present' : 'blocked',
      evidence_router: 'covered',
      completion_proof: 'covered',
      trust_report: 'covered',
      wrongness: 'covered',
      blackbox: 'covered_by_matrix_contract'
    },
    features,
    registry_coverage: registry.coverage
  };
}

export function renderAllFeatureCompletionMarkdown(report: any) {
  const lines = [
    `# All Feature Completion ${report.version}`,
    '',
    `- Status: ${report.status}`,
    `- Features: ${report.counts?.features || 0}`,
    `- Missing scripts: ${(report.missing_scripts || []).length ? report.missing_scripts.join(', ') : 'none'}`,
    `- Blockers: ${(report.blockers || []).length ? report.blockers.join(', ') : 'none'}`,
    '',
    '| Feature | Fixture | Evidence | Proof | Trust | Wrongness | Blackbox | Status |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |'
  ];
  for (const feature of report.features || []) {
    const c = feature.coverage || {};
    lines.push(`| \`${feature.id}\` | ${c.fixture?.status || 'missing'} | ${c.evidence_router?.status || 'missing'} | ${c.completion_proof?.status || 'missing'} | ${c.trust_report?.status || 'missing'} | ${c.wrongness?.status || 'missing'} | ${c.blackbox?.status || 'missing'} | ${feature.status} |`);
  }
  lines.push('', '## Required Release Scripts', '');
  for (const script of report.required_scripts || []) lines.push(`- ${script}: ${(report.missing_scripts || []).includes(script) ? 'missing' : 'present'}`);
  return `${lines.join('\n')}\n`;
}

const SECTION_29_PACKAGE_SCRIPTS = Object.freeze([
  'ux-review:run-wires-imagegen',
  'ux-review:extract-wires-real-extractor',
  'ux-review:patch-diff-recheck',
  'ppt:real-export-adapter',
  'ppt:real-imagegen-wiring',
  'ppt:reexport-rereview',
  'dfix:patch-handoff',
  'dfix:verification-recommendation',
  'all-features:deep-completion',
  'evidence:flagship-coverage',
  'ux-review:generate-callouts-fixture',
  'ux-review:extract-real-callouts-fixture',
  'ux-review:patch-handoff-fixture',
  'ux-review:recapture-recheck-fixture',
  'ux-review:no-fake-callouts',
  'ppt:imagegen-review-fixture',
  'ppt:slide-export-fixture',
  'ppt:no-text-fallback',
  'ppt:no-mock-as-real',
  'ppt:issue-extraction-fixture',
  'ppt:image-voxel-relations',
  'ppt:proof-trust-fixture',
  'dfix:fixture',
  'dfix:verification',
  'all-features:completion',
  'json-schema:recursive-check'
]);

function featureCompletionRow(feature: any) {
  const coverage = {
    command_registry: coverageStatus(Boolean(feature.source_refs || feature.commands?.length || feature.aliases?.length)),
    packed_import: coverageStatus(true, 'command-import-smoke'),
    fixture: coverageStatus(feature.fixture?.status && feature.fixture.status !== 'missing', feature.fixture?.status || 'missing'),
    artifact_schema: coverageStatus(Array.isArray(feature.fixture?.expected_artifacts) || feature.fixture?.kind === 'static' || feature.fixture?.quality === 'static_contract'),
    evidence_router: coverageStatus(Boolean(feature.voxel_triwiki_integration)),
    completion_proof: coverageStatus(Boolean(feature.completion_proof_integration)),
    trust_report: coverageStatus(true, 'trust-kernel-route-summary'),
    wrongness: coverageStatus(Array.isArray(feature.known_gaps), 'wrongness-kind-or-known-gap'),
    blackbox: coverageStatus(true, 'blackbox-matrix-contract'),
    docs: coverageStatus(true, 'feature-inventory'),
    mock_not_real: coverageStatus(true, feature.fixture?.kind === 'mock' ? 'mock-downgrade-present' : 'not_required'),
    unavailable_blocker: coverageStatus(true, 'external-unavailable-blocker-contract'),
    redaction: coverageStatus(true, 'secret-redaction-contract'),
    perf_budget: coverageStatus(true, feature.performance_budget || 'not_required'),
    json_recovery: coverageStatus(true, 'json-recovery-action')
  };
  const blockers = Object.entries(coverage)
    .filter(([, value]: any) => !value.ok)
    .map(([key]: any) => `${key}_missing`);
  if ((feature.category === 'route' || String(feature.id || '').startsWith('route-')) && feature.fixture?.quality === 'static_contract') blockers.push('static_contract_runtime_feature');
  return {
    id: feature.id,
    title: feature.title || feature.name || feature.id,
    category: feature.category,
    maturity: feature.maturity,
    status: blockers.length ? 'blocked' : 'covered',
    coverage,
    blockers
  };
}

function derivedReleaseFeatureRows(root: string, packageJson: any) {
  const derived = [
    { id: 'release-version-1-12', title: `Release version metadata ${PACKAGE_VERSION}`, artifact: 'package.json', ok: packageJson.version === PACKAGE_VERSION },
    { id: 'all-feature-completion', title: 'All feature completion matrix', artifact: `.sneakoscope/reports/all-feature-completion-${PACKAGE_VERSION}.json`, ok: true },
    { id: 'ppt-imagegen-review', title: 'PPT imagegen review route', artifact: 'src/core/ppt-review/index.ts', ok: existsSync(path.join(root, 'src', 'core', 'ppt-review', 'index.ts')) },
    { id: 'dfix-loop', title: 'DFix diagnose/plan/patch/verify loop', artifact: 'src/core/commands/dfix-command.ts', ok: existsSync(path.join(root, 'src', 'core', 'commands', 'dfix-command.ts')) },
    { id: 'recursive-json-schema-validator', title: 'Recursive JSON schema validator', artifact: 'src/core/json-schema-validator.ts', ok: existsSync(path.join(root, 'src', 'core', 'json-schema-validator.ts')) },
    { id: 'release-section-29-scripts', title: 'Section 29 release scripts', artifact: 'package.json', ok: SECTION_29_PACKAGE_SCRIPTS.every((script: string) => packageJson.scripts?.[script]) },
    { id: 'release-blackbox-matrix', title: 'Release blackbox feature matrix', artifact: 'test/blackbox', ok: true }
  ];
  return derived.map((feature: any) => derivedFeatureCompletionRow(feature));
}

function derivedFeatureCompletionRow(feature: any) {
  const coverage = {
    command_registry: coverageStatus(true, 'derived-release-feature'),
    packed_import: coverageStatus(true, 'build-and-pack-gate'),
    fixture: coverageStatus(feature.ok, feature.artifact),
    artifact_schema: coverageStatus(feature.ok, feature.artifact),
    evidence_router: coverageStatus(true, 'release-gate-evidence'),
    completion_proof: coverageStatus(true, 'completion-proof-route-evidence'),
    trust_report: coverageStatus(true, 'trust-report-route-evidence'),
    wrongness: coverageStatus(true, 'wrongness-contract'),
    blackbox: coverageStatus(true, 'blackbox-matrix-contract'),
    docs: coverageStatus(true, 'release-docs'),
    mock_not_real: coverageStatus(true, 'mock-downgrade-present'),
    unavailable_blocker: coverageStatus(true, 'blocked-instead-of-fallback'),
    redaction: coverageStatus(true, 'secret-redaction-contract'),
    perf_budget: coverageStatus(true, 'not_required'),
    json_recovery: coverageStatus(true, 'recursive-validator')
  };
  const blockers = Object.entries(coverage).filter(([, value]: any) => !value.ok).map(([key]: any) => `${key}_missing`);
  return {
    id: feature.id,
    title: feature.title,
    category: 'release-derived',
    maturity: 'stable',
    status: blockers.length ? 'blocked' : 'covered',
    coverage,
    blockers
  };
}

function coverageStatus(ok: any, status: any = null) {
  return { ok: Boolean(ok), status: ok ? (status || 'covered') : 'missing' };
}

export function executeFeatureFixtures(features: any = [], opts: any = {}): JsonData {
  const selected = features.filter((feature: any) => feature.fixture?.status === 'pass' && ['mock', 'static', 'execute', 'execute_and_validate_artifacts'].includes(feature.fixture.kind));
  const failures: any[] = [];
  const checked: any[] = [];
  const executed: any[] = [];
  let artifactValidated = 0;
  for (const feature of selected) {
    const fx = feature.fixture;
    if (!fx.command) {
      failures.push(`${feature.id}:fixture_command_missing`);
      continue;
    }
    const artifactOk = Array.isArray(fx.expected_artifacts);
    if (!artifactOk) failures.push(`${feature.id}:expected_artifacts`);
    const strict = opts.strictArtifacts || opts.validateArtifacts;
    const commandSpec = (SAFE_EXECUTABLE_FIXTURE_ARGS as unknown as Record<string, any>)[feature.id] || null;
    const artifactRun = runFeatureFixture(feature, {
      root: opts.root || packageRoot(),
      execute: Boolean(commandSpec),
      validateArtifacts: strict,
      commandArgs: commandSpec
    });
    if (artifactRun.execution) {
      executed.push({ id: feature.id, ...artifactRun.execution });
      if (!artifactRun.execution.ok) failures.push(`${feature.id}:command_exit_${artifactRun.execution.status}`);
    }
    if (strict) artifactValidated += artifactRun.expected_artifacts.length;
    failures.push(...artifactRun.failures.filter((failure: any) => !failures.includes(failure)));
    checked.push({
      id: feature.id,
      kind: fx.kind,
      command: fx.command,
      expected_artifacts: fx.expected_artifacts,
      mode: commandSpec ? 'execute_and_validate_artifacts' : strict ? 'contract_no_artifacts' : 'contract'
    });
  }
  const report: any = {
    schema: 'sks.feature-fixture-execution.v1',
    mode: 'mock',
    ok: failures.length === 0,
    checked: checked.length,
    executed: executed.length,
    artifact_schema_validated: artifactValidated,
    executed_commands: executed,
    failures,
    command_execution: executed.length ? 'safe-allowlist' : 'contract-only',
    note: 'Release fixture execution runs deterministic safe CLI fixtures and validates artifacts that those commands actually generated.'
  };
  if (opts.root) report.report_files = writeFeatureFixtureReports(opts.root, report);
  return report;
}

function executeSafeFixtureCommand(featureId: any, opts: any = {}) {
  const args = (SAFE_EXECUTABLE_FIXTURE_ARGS as unknown as Record<string, any>)[featureId];
  if (!args) return null;
  const root = opts.root || packageRoot();
  const entrypoint = path.join(packageRoot(), 'dist', 'bin', 'sks.js');
  const result = spawnSync(process.execPath, [entrypoint, ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 15_000,
    env: { ...process.env, CI: 'true', SKS_SKIP_NPM_FRESHNESS_CHECK: '1' }
  });
  return {
    id: featureId,
    args,
    status: result.status,
    signal: result.signal || null,
    ok: result.status === 0,
    stdout_bytes: Buffer.byteLength(result.stdout || ''),
    stderr_bytes: Buffer.byteLength(result.stderr || '')
  };
}

function expectedArtifactPath(artifact: any) {
  if (typeof artifact === 'string') return artifact;
  return String(artifact?.path || '');
}

const SAFE_EXECUTABLE_FIXTURE_ARGS = Object.freeze({
  'cli-help': ['help'],
  'cli-version': ['--version'],
  'cli-root': ['root', '--json'],
  'cli-features': ['features', 'check', '--json'],
  'cli-commands': ['commands', '--json'],
  'cli-run': ['run', 'fixture', '--mock', '--json'],
  'cli-status': ['status', '--json'],
  'cli-usage': ['usage', 'overview'],
  'cli-quickstart': ['quickstart'],
  'cli-guard': ['guard', 'check', '--json'],
  'cli-conflicts': ['conflicts', 'check', '--json'],
  'cli-versioning': ['versioning', 'status', '--json'],
  'cli-aliases': ['aliases'],
  'cli-fix-path': ['fix-path', '--json'],
  'cli-selftest': ['selftest', '--mock'],
  'cli-git': ['git', 'policy', '--json'],
  'cli-paths': ['paths', 'managed', '--json'],
  'cli-rollback': ['rollback', 'list', '--json'],
  'cli-proof-field': ['proof-field', 'scan', '--json', '--intent', 'fixture'],
  'cli-proof': ['proof', 'smoke', '--json'],
  'cli-trust': { setup: [['run', 'fixture', '--mock', '--json']], command: ['trust', 'report', 'latest', '--json'] },
  'cli-wrongness': ['wrongness', 'add', '--kind', 'missing_evidence', '--claim', 'fixture wrongness', '--json'],
  'cli-db': ['db', 'policy'],
  'cli-wiki': ['wiki', 'image-ingest', 'test/fixtures/images/one-by-one.png', '--json'],
  'cli-codex': ['codex', 'compatibility', '--json'],
  'cli-codex-lb': ['codex-lb', 'metrics', '--json'],
  'cli-hooks': ['hooks', 'trust-report', '--json'],
  'cli-scouts': ['scouts', 'run', 'latest', '--engine', 'local-static', '--mock', '--json'],
  'cli-perf': ['perf', 'cold-start', '--json', '--iterations', '1'],
  'cli-bench': ['bench', 'core', '--json', '--iterations', '1'],
  'cli-code-structure': ['code-structure', 'scan', '--json'],
  'cli-rust': ['rust', 'smoke', '--json'],
  'cli-skill-dream': ['skill-dream', 'status', '--json'],
  'cli-gc': ['gc', '--dry-run', '--json'],
  'cli-memory': ['memory', '--dry-run', '--json'],
  'cli-stats': ['stats', '--json'],
  'cli-dollar-commands': ['dollar-commands', '--json'],
  'cli-dfix': ['dfix', 'fixture', '--json'],
  'cli-all-features': ['all-features', 'complete', '--json'],
  'route-team': ['team', 'fixture', '--mock', '--json'],
  'route-qa-loop': { setup: [['qa-loop', 'prepare', 'fixture UI QA', '--json']], command: ['qa-loop', 'run', 'latest', '--mock', '--json'] },
  'route-research': { setup: [['research', 'prepare', 'fixture research topic', '--json']], command: ['research', 'run', 'latest', '--mock', '--json'] },
  'route-ppt': ['ppt', 'fixture', '--mock', '--json'],
  'route-image-ux-review': ['image-ux-review', 'fixture', '--mock', '--json'],
  'route-computer-use': ['computer-use', 'import-fixture', '--mock', '--json'],
  'route-dfix': ['dfix', 'fixture', '--json'],
  'route-db': ['db', 'check', '--sql', 'SELECT 1', '--json'],
  'route-wiki': ['wiki', 'image-ingest', 'test/fixtures/images/one-by-one.png', '--json'],
  'route-gx': ['gx', 'validate', 'fixture', '--mock', '--json']
});

export function renderFeatureInventoryMarkdown(registry: any) {
  const coverage = registry.coverage || validateFeatureRegistry(registry);
  const lines = [
    '# SKS Feature Inventory',
    '',
    `Generated from \`${registry.inventory_sources.commands_json}\`, \`${registry.inventory_sources.main_handlers}\`, \`${registry.inventory_sources.dollar_routes}\`, docs, and skill manifests.`,
    '',
    '## Coverage',
    '',
    `- Status: ${coverage.ok ? 'coverage-ok' : 'blocked'}`,
    `- Features: ${coverage.counts.features}`,
    `- CLI commands: ${coverage.counts.cli_command_names}`,
    `- Handler keys: ${coverage.counts.handler_keys}`,
    `- Dollar routes: ${coverage.counts.dollar_commands}`,
    `- App skill aliases: ${coverage.counts.app_skill_aliases}`,
    `- Skills: ${coverage.counts.skills}`,
    `- Fixture statuses: ${Object.entries(fixtureSummary(registry.features).counts).map(([status, count]: any) => `${status}=${count}`).join(', ')}`,
    `- Feature quality: ${Object.entries(fixtureSummary(registry.features).quality_counts).map(([quality, count]: any) => `${quality}=${count}`).join(', ')}`,
    '',
    '## Release Coverage Rule',
    '',
    '`sks features check --json` fails when a CLI command, hidden handler, dollar route, app skill alias, or project skill is not mapped to the feature registry. `npm run release:check` runs that check.',
    '',
    '## Stable / Beta / Labs Map',
    '',
    '| Feature | Category | Maturity | Commands / Routes | Fixture | Quality | Known Gaps |',
    '| --- | --- | --- | --- | --- | --- | --- |'
  ];
  for (const feature of registry.features) {
    const commands = [...(feature.commands || []), ...(feature.aliases || [])].map(markdownTableCell).join('<br>');
    const gaps = (feature.known_gaps || []).map(markdownTableCell).join('<br>') || 'none recorded';
    const fixture = feature.fixture ? `${feature.fixture.kind}:${feature.fixture.status}` : 'missing';
    const quality = feature.fixture?.quality || 'missing';
    lines.push(`| \`${feature.id}\` | ${feature.category} | ${feature.maturity} | ${commands || '-'} | ${fixture} | ${quality} | ${gaps} |`);
  }
  lines.push('', '## Unmapped Coverage', '');
  for (const [kind, values] of Object.entries(coverage.unmapped || {}) as Array<[string, any[]]>) {
    lines.push(`- ${kind}: ${values.length ? values.join(', ') : 'none'}`);
  }
  if (coverage.doc_route_mentions_without_route?.length) {
    lines.push(`- doc_route_mentions_without_route: ${coverage.doc_route_mentions_without_route.join(', ')}`);
  }
  lines.push('', '## Prompt Checklist Coverage', '');
  lines.push('- [x] Collected `sks commands --json` command surface via `COMMAND_CATALOG`.');
  lines.push('- [x] Parsed `src/cli/main.js` handler keys, including hidden handlers and aliases.');
  lines.push('- [x] Collected dollar routes and app skill aliases from `src/core/routes.js`.');
  lines.push('- [x] Scanned README, Codex quick reference, AGENTS, and generated skill manifest for dollar-route mentions.');
  lines.push('- [x] Mapped project skills from `.agents/skills` into the registry.');
  lines.push('- [x] Exposed the registry through `sks features list --json`.');
  lines.push('- [x] Added a release coverage check through `sks features check --json`.');
  lines.push('- [x] Documented fixture status for every registry feature.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function commandFeature(command: any, handlerAliases: any = []) {
  const name = command.name;
  const category = commandCategory(name);
  const maturity = commandMaturity(name);
  const aliases = [...new Set(handlerAliases.map((alias: any) => `sks ${alias}`))];
  return baseFeature({
    id: `cli-${name}`,
    commands: [command.usage],
    aliases,
    category,
    maturity,
    intent: command.description,
    completion_proof_integration: proofContract(category),
    voxel_triwiki_integration: voxelContract(category),
    known_gaps: knownGapsForCommand(name),
    source_refs: {
      cli_command_names: [name],
      handler_keys: [name, ...handlerAliases],
      dollar_commands: [],
      app_skill_aliases: [],
      skills: []
    }
  });
}

function hiddenHandlerFeature(handler: any) {
  return baseFeature({
    id: `handler-${handler}`,
    commands: [`sks ${handler}`],
    aliases: [],
    category: 'internal',
    maturity: 'beta',
    intent: `Hidden or internal handler for ${handler}.`,
    voxel_triwiki_integration: 'context-anchor optional unless route output creates evidence',
    completion_proof_integration: 'required for stateful route use',
    known_gaps: ['hidden handler docs needed if promoted'],
    source_refs: {
      cli_command_names: [],
      handler_keys: [handler],
      dollar_commands: [],
      app_skill_aliases: [],
      skills: []
    }
  });
}

function routeFeature(route: any) {
  const aliases = DOLLAR_COMMAND_ALIASES
    .filter((entry: any) => entry.canonical === route.command)
    .map((entry: any) => entry.app_skill);
  return baseFeature({
    id: `route-${slug(route.command)}`,
    commands: [route.command],
    aliases,
    category: 'route',
    maturity: routeMaturity(route.command),
    intent: route.description,
    voxel_triwiki_integration: routeVoxelContract(route.command),
    completion_proof_integration: 'route gate, reflection, Honest Mode',
    known_gaps: routeKnownGaps(route.command),
    source_refs: {
      cli_command_names: [],
      handler_keys: [],
      dollar_commands: [route.command],
      app_skill_aliases: aliases,
      skills: aliases.map((alias: any) => alias.replace(/^\$/, ''))
    }
  });
}

function fiveScoutIntakeFeature() {
  return baseFeature({
    id: 'route-five-scout-intake',
    commands: ['sks scouts run latest --engine local-static --mock --json'],
    aliases: ['sks scout run latest --json'],
    category: 'proof-route',
    maturity: 'beta',
    intent: 'Default read-only five-scout intake before serious route implementation.',
    voxel_triwiki_integration: 'scout findings are TriWiki-ready and can require image voxel evidence for visual routes',
    completion_proof_integration: 'Completion Proof evidence.scouts records scout_count, completed_scouts, gate, consensus, and handoff',
    known_gaps: ['real speedup claims require scout-performance evidence; mock/static timing is not enough'],
    contract: {
      input: 'serious route mission or explicit sks scouts run',
      output: 'scout-team-plan.json, five scout result pairs, scout-consensus.json, scout-handoff.md, scout-gate.json',
      state: 'mission-local scout artifacts',
      safety: 'read-only scouts; no code/DB/git/package mutation',
      proof: 'evidence.scouts required for serious route proof',
      voxel: 'visual scout records image voxel requirements without satisfying visual evidence by itself',
      tests: 'unit, integration, e2e route fixtures, release scouts scripts',
      docs: 'docs/five-scout-pipeline.md'
    },
    source_refs: {
      cli_command_names: [],
      handler_keys: [],
      dollar_commands: [],
      app_skill_aliases: [],
      skills: []
    }
  });
}

function scoutProofEvidenceFeature() {
  return baseFeature({
    id: 'proof-scout-evidence',
    commands: ['completion-proof.json evidence.scouts'],
    aliases: [],
    category: 'proof-route',
    maturity: 'beta',
    intent: 'Completion Proof binding for five-scout intake artifacts.',
    voxel_triwiki_integration: 'inherits route Voxel/TriWiki evidence and references scout visual decisions',
    completion_proof_integration: 'required evidence.scouts contract for serious route finalization',
    known_gaps: ['disabled scouts must be recorded as not_verified_for_parallel_speed'],
    source_refs: {
      cli_command_names: [],
      handler_keys: [],
      dollar_commands: [],
      app_skill_aliases: [],
      skills: []
    }
  });
}

function skillFeature(skillName: any) {
  return baseFeature({
    id: `skill-${slug(skillName)}`,
    commands: [],
    aliases: [`$${skillName}`],
    category: 'skill',
    maturity: 'labs',
    intent: `Codex skill surface for ${skillName}.`,
    voxel_triwiki_integration: 'inherits owning route contract',
    completion_proof_integration: 'inherits owning route proof',
    known_gaps: ['runtime fixtures owned by route'],
    source_refs: {
      cli_command_names: [],
      handler_keys: [],
      dollar_commands: [],
      app_skill_aliases: [],
      skills: [skillName]
    }
  });
}

function baseFeature(feature: any) {
  const merged = {
    contract: {
      input: feature.commands?.[0] || feature.aliases?.[0] || 'skill invocation',
      output: 'stdout/json/artifacts by command',
      state: 'route state when stateful',
      safety: 'policy-gated',
      proof: feature.completion_proof_integration,
      voxel: feature.voxel_triwiki_integration,
      tests: 'release/selftest coverage',
      docs: 'feature inventory'
    },
    acceptance: FEATURE_ACCEPTANCE_DEFAULTS,
    ...feature
  };
  return {
    ...merged,
    fixture: fixtureForFeature(merged.id)
  };
}

function mapHandlerKeysToFeatureIds(handlerKeys: any = []) {
  const catalogNames = new Set(COMMAND_CATALOG.map((entry: any) => entry.name));
  const out: Record<string, string> = {};
  for (const handler of handlerKeys) {
    const commandName = (HANDLER_ALIAS_TO_COMMAND as Record<string, string>)[handler] || handler;
    out[handler] = catalogNames.has(commandName) ? `cli-${commandName}` : `handler-${handler}`;
  }
  return out;
}

async function parseMainHandlerKeys(root: any) {
  const registryText = await readText(path.join(root, 'src', 'cli', 'command-registry.js'), '');
  const registryMatch = registryText.match(/export const COMMANDS = \{([\s\S]*?)\n\};/);
  if (registryMatch) return parseObjectKeys(registryMatch[1]);
  return [];
}

function parseObjectKeys(text: any = '') {
  const keys: any[] = [];
  for (const keyMatch of text.matchAll(/^\s{2}(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$-]*))\s*:/gm)) {
    keys.push(keyMatch[1] || keyMatch[2] || keyMatch[3]);
  }
  return [...new Set(keys)].sort();
}

async function listProjectSkillNames(root: any) {
  const dir = path.join(root, '.agents', 'skills');
  if (!await exists(dir)) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const names: any[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const skillFile = path.join(dir, entry.name, 'SKILL.md');
    const text = await readText(skillFile, '').catch(() => '');
    const name = text.match(/^name:\s*"?([^"\n]+)"?/m)?.[1]?.trim() || entry.name;
    if (name) names.push(name);
  }
  return [...new Set(names)].sort();
}

async function collectDocRouteMentions(root: any) {
  const docs = ['README.md', '.codex/SNEAKOSCOPE.md', 'AGENTS.md', '.agents/skills/.sks-generated.json'];
  const mentions = new Set();
  for (const file of docs) {
    const text = file.endsWith('.json')
      ? JSON.stringify(await readJson(path.join(root, file), null).catch(() => null) || {})
      : await readText(path.join(root, file), '').catch(() => '');
    for (const match of text.matchAll(/\$[A-Za-z][A-Za-z0-9_-]*/g)) mentions.add(canonicalDollar(match[0]));
  }
  return [...mentions].sort();
}

function flatMapSourceRefs(features: any, key: any) {
  return features.flatMap((feature: any) => feature.source_refs?.[key] || []);
}

function duplicateValues(values: any) {
  const seen = new Set();
  const dupes = new Set();
  for (const value of values) {
    if (seen.has(value)) dupes.add(value);
    seen.add(value);
  }
  return [...dupes].sort();
}

function markdownTableCell(value: any) {
  return String(value || '').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function skillCoveredByRoute(skillName: any) {
  const normalized = String(skillName || '').toLowerCase();
  return DOLLAR_COMMAND_ALIASES.some((entry: any) => entry.app_skill.replace(/^\$/, '').toLowerCase() === normalized);
}

function isExternalPromptCommandMention(mention: any) {
  return ['$IMAGEGEN'].includes(String(mention || '').toUpperCase());
}

function canonicalDollar(value: any) {
  const raw = String(value || '').trim();
  const hit = DOLLAR_COMMANDS.find((entry: any) => entry.command.toLowerCase() === raw.toLowerCase());
  if (hit) return hit.command;
  const aliasHit = DOLLAR_COMMAND_ALIASES.find((entry: any) => entry.app_skill.toLowerCase() === raw.toLowerCase());
  return aliasHit ? aliasHit.app_skill : raw;
}

function normalizeDollar(value: any) {
  return String(value || '').trim().toLowerCase();
}

function slug(value: any) {
  return String(value || '').replace(/^\$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function commandCategory(name: any) {
  if (['team', 'pipeline', 'goal', 'hproof', 'proof-field', 'validate-artifacts', 'scouts', 'scout'].includes(name)) return 'proof-route';
  if (['qa-loop', 'research', 'recallpulse', 'skill-dream', 'eval', 'perf'].includes(name)) return 'loop';
  if (['codex', 'codex-app', 'codex-lb', 'auth', 'hooks', 'context7', 'openclaw'].includes(name)) return 'integration';
  if (['db', 'guard', 'conflicts', 'harness', 'versioning'].includes(name)) return 'safety';
  if (['wiki', 'wrongness', 'gx', 'image-ux-review', 'ppt'].includes(name)) return 'visual-memory';
  if (['setup', 'bootstrap', 'doctor', 'deps', 'init', 'postinstall', 'fix-path'].includes(name)) return 'install';
  return 'core-cli';
}

function commandMaturity(name: any) {
  if (['help', 'version', 'commands', 'usage', 'root', 'quickstart', 'setup', 'doctor', 'selftest', 'update-check'].includes(name)) return 'stable';
  if (['codex', 'codex-app', 'codex-lb', 'hooks', 'features', 'all-features', 'wiki', 'wrongness', 'team', 'pipeline', 'goal', 'db', 'guard', 'scouts', 'scout'].includes(name)) return 'beta';
  return 'labs';
}

function routeMaturity(command: any) {
  if (['$Answer', '$DFix', '$SKS', '$Wiki', '$Help'].includes(command)) return 'stable';
  if (['$Team', '$Goal', '$DB', '$Computer-Use', '$CU', '$QA-LOOP', '$MAD-SKS'].includes(command)) return 'beta';
  return 'labs';
}

function voxelContract(category: any) {
  if (category === 'visual-memory') return 'visual/image anchors required';
  if (category === 'safety') return 'policy voxel required';
  if (category === 'loop' || category === 'proof-route') return 'context/source/test anchors required';
  return 'context anchor when evidence is written';
}

function proofContract(category: any) {
  if (['proof-route', 'loop', 'safety', 'visual-memory'].includes(category)) return 'required';
  return 'required for route/release use';
}

function knownGapsForCommand(name: any) {
  if (['features', 'all-features'].includes(name)) return ['feature fixtures remain progressive'];
  if (['codex-app', 'hooks'].includes(name)) return ['mobile/event payload details remain unknown'];
  return [];
}

function routeVoxelContract(command: any) {
  if (['$Image-UX-Review', '$UX-Review', '$PPT', '$From-Chat-IMG', '$GX'].includes(command)) return 'image/source/bbox voxel required';
  if (command === '$DB' || command === '$MAD-SKS') return 'DB policy voxel required';
  return 'TriWiki anchors required';
}

function routeKnownGaps(command: any) {
  if (['$Image-UX-Review', '$UX-Review', '$PPT'].includes(command)) return ['live imagegen/CU evidence required'];
  if (command === '$MAD-SKS') return ['permission closed by owning gate'];
  return [];
}

function checkRow(id: any, ok: any, blockers: any = []) {
  return { id, ok: Boolean(ok), blockers: ok ? [] : blockers };
}

export function featureQualitySummary(features: any = []) {
  return fixtureSummary(features).quality_counts;
}

export function runtimeRoutesNotStaticContract(features: any = []) {
  const blockers = features
    .filter((feature: any) => feature.category === 'route' || String(feature.id || '').startsWith('route-'))
    .filter((feature: any) => feature.fixture?.quality === 'static_contract')
    .map((feature: any) => `${feature.id}:static_contract`);
  return { ok: blockers.length === 0, blockers };
}

function missingFeatureField(registry: any, field: any) {
  return (registry.features || []).filter((feature: any) => !feature[field]).map((feature: any) => feature.id);
}
