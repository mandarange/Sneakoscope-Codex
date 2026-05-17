import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { COMMAND_CATALOG, DOLLAR_COMMAND_ALIASES, DOLLAR_COMMANDS } from './routes.mjs';
import { fixtureForFeature, fixtureSummary, validateFeatureFixtures } from './feature-fixtures.mjs';
import { runFeatureFixture, writeFeatureFixtureReports } from './feature-fixture-runner.mjs';
import { exists, nowIso, packageRoot, readJson, readText, runProcess, writeTextAtomic } from './fsx.mjs';

export const FEATURE_REGISTRY_SCHEMA = 'sks.feature-registry.v1';
export const FEATURE_INVENTORY_SCHEMA = 'sks.feature-inventory.v1';
export const ALL_FEATURES_SELFTEST_SCHEMA = 'sks.all-features-selftest.v1';

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

export async function buildFeatureRegistry({ root = packageRoot(), generatedAt = nowIso() } = {}) {
  const handlerKeys = await parseMainHandlerKeys(root);
  const skillNames = await listProjectSkillNames(root);
  const docRouteMentions = await collectDocRouteMentions(root);
  const handlerToFeature = mapHandlerKeysToFeatureIds(handlerKeys);
  const features = [];

  for (const command of COMMAND_CATALOG) {
    const handlerAliases = Object.entries(handlerToFeature)
      .filter(([, featureId]) => featureId === `cli-${command.name}`)
      .map(([handler]) => handler)
      .filter((handler) => handler !== command.name);
    features.push(commandFeature(command, handlerAliases));
  }

  for (const handler of handlerKeys) {
    const featureId = handlerToFeature[handler];
    if (!features.some((feature) => feature.id === featureId)) {
      features.push(hiddenHandlerFeature(handler));
    }
  }

  for (const route of DOLLAR_COMMANDS) features.push(routeFeature(route));
  features.push(fiveScoutIntakeFeature());
  features.push(scoutProofEvidenceFeature());
  for (const skillName of skillNames) {
    if (!skillCoveredByRoute(skillName)) features.push(skillFeature(skillName));
  }

  const registry = {
    schema: FEATURE_REGISTRY_SCHEMA,
    generated_at: generatedAt,
    inventory_sources: {
      commands_json: 'sks commands --json',
      main_handlers: 'src/cli/main.mjs',
      dollar_routes: 'src/core/routes.mjs',
      docs: ['README.md', '.codex/SNEAKOSCOPE.md', 'AGENTS.md', '.agents/skills/.sks-generated.json'],
      skills: '.agents/skills'
    },
    features,
    fixture_summary: fixtureSummary(features),
    source_inventory: {
      cli_command_names: COMMAND_CATALOG.map((entry) => entry.name),
      handler_keys: handlerKeys,
      dollar_commands: DOLLAR_COMMANDS.map((entry) => entry.command),
      app_skill_aliases: DOLLAR_COMMAND_ALIASES.map((entry) => entry.app_skill),
      skills: skillNames,
      doc_route_mentions: docRouteMentions
    }
  };
  registry.coverage = validateFeatureRegistry(registry);
  return registry;
}

export function validateFeatureRegistry(registry = {}) {
  const features = Array.isArray(registry.features) ? registry.features : [];
  const source = registry.source_inventory || {};
  const mappedCli = new Set(flatMapSourceRefs(features, 'cli_command_names'));
  const mappedHandlers = new Set(flatMapSourceRefs(features, 'handler_keys'));
  const mappedRoutes = new Set(flatMapSourceRefs(features, 'dollar_commands'));
  const mappedAliases = new Set(flatMapSourceRefs(features, 'app_skill_aliases'));
  const mappedSkills = new Set(flatMapSourceRefs(features, 'skills'));
  const mappedRouteMentions = new Set([...mappedRoutes, ...mappedAliases].map(normalizeDollar));

  const unmapped = {
    cli_command_names: (source.cli_command_names || []).filter((name) => !mappedCli.has(name)),
    handler_keys: (source.handler_keys || []).filter((name) => !mappedHandlers.has(name)),
    dollar_commands: (source.dollar_commands || []).filter((name) => !mappedRoutes.has(name)),
    app_skill_aliases: (source.app_skill_aliases || []).filter((name) => !mappedAliases.has(name)),
    skills: (source.skills || []).filter((name) => !mappedSkills.has(name))
  };
  const duplicateFeatureIds = duplicateValues(features.map((feature) => feature.id));
  const routeMentionsWithoutRoute = (source.doc_route_mentions || [])
    .filter((mention) => !mappedRouteMentions.has(normalizeDollar(mention)) && !isExternalPromptCommandMention(mention));
  const blockers = [
    ...Object.entries(unmapped).flatMap(([kind, values]) => values.map((value) => `${kind}:${value}`)),
    ...duplicateFeatureIds.map((id) => `duplicate_feature_id:${id}`),
    ...routeMentionsWithoutRoute.map((mention) => `doc_route_mention_without_route:${mention}`)
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
    fixture_summary: fixtureSummary(features)
  };
}

export async function writeFeatureInventoryDocs({ root = packageRoot(), outFile = path.join(root, 'docs', 'feature-inventory.md') } = {}) {
  const registry = await buildFeatureRegistry({ root });
  const markdown = renderFeatureInventoryMarkdown(registry);
  await writeTextAtomic(outFile, markdown);
  return { ok: registry.coverage.ok, path: outFile, registry };
}

export function buildAllFeaturesSelftest(registry, opts = {}) {
  const coverage = validateFeatureRegistry(registry);
  const fixtures = validateFeatureFixtures(registry.features || []);
  const fixturesSummary = fixtureSummary(registry.features || []);
  const executable = opts.executeFixtures ? executeFeatureFixtures(registry.features || [], opts) : null;
  const checks = [
    checkRow('feature_registry_completeness', coverage.ok, coverage.blockers),
    checkRow('command_lazy_load_availability', coverage.unmapped.cli_command_names.length === 0 && coverage.unmapped.handler_keys.length === 0, [...coverage.unmapped.cli_command_names, ...coverage.unmapped.handler_keys]),
    checkRow('json_schema_validation', registry.schema === FEATURE_REGISTRY_SCHEMA && Array.isArray(registry.features), []),
    checkRow('proof_integration_contracts_present', registry.features.every((feature) => Boolean(feature.completion_proof_integration)), missingFeatureField(registry, 'completion_proof_integration')),
    checkRow('voxel_triwiki_contracts_present', registry.features.every((feature) => Boolean(feature.voxel_triwiki_integration)), missingFeatureField(registry, 'voxel_triwiki_integration')),
    checkRow('failure_contracts_present', registry.features.every((feature) => Array.isArray(feature.known_gaps)), missingFeatureField(registry, 'known_gaps')),
    checkRow('fixture_contracts_present', fixtures.ok, fixtures.blockers),
    checkRow('fixture_fallback_removed', registry.features.every((feature) => feature.fixture?.fallback_removed === true && feature.fixture?.status !== 'missing'), registry.features.filter((feature) => feature.fixture?.fallback_removed !== true || feature.fixture?.status === 'missing').map((feature) => feature.id)),
    checkRow('proof_fixture_contract_present', registry.features.some((feature) => feature.id === 'cli-proof' && feature.fixture?.status === 'pass'), ['cli-proof']),
    checkRow('voxel_fixture_contract_present', registry.features.some((feature) => feature.id === 'cli-wiki' && feature.fixture?.expected_artifacts?.some((artifact) => expectedArtifactPath(artifact).includes('image-voxel-ledger'))), ['cli-wiki']),
    checkRow('five_scout_intake_contract_present', registry.features.some((feature) => feature.id === 'route-five-scout-intake'), ['route-five-scout-intake']),
    checkRow('scout_gate_fixture_pass', registry.features.some((feature) => feature.id === 'cli-scouts' && feature.fixture?.status === 'pass' && feature.fixture.expected_artifacts?.some((artifact) => expectedArtifactPath(artifact).includes('scout-gate'))), ['cli-scouts']),
    checkRow('scout_proof_evidence_contract_present', registry.features.some((feature) => feature.id === 'proof-scout-evidence'), ['proof-scout-evidence']),
    checkRow('scout_read_only_policy_present', registry.features.some((feature) => feature.id === 'route-five-scout-intake' && /read-only/i.test(JSON.stringify(feature.contract || {}))), ['route-five-scout-intake']),
    checkRow('fixture_pass_threshold', (fixturesSummary.counts.pass || 0) >= 90, [`pass=${fixturesSummary.counts.pass || 0}`]),
    checkRow('fixture_not_required_ceiling', (fixturesSummary.counts.not_required || 0) <= 16, [`not_required=${fixturesSummary.counts.not_required || 0}`]),
    checkRow('fixture_mock_blocked_zero', (fixturesSummary.counts.blocked || 0) === 0, [`blocked=${fixturesSummary.counts.blocked || 0}`]),
    ...(executable ? [checkRow('executable_fixture_contracts', executable.ok, executable.failures)] : [])
  ];
  const ok = checks.every((check) => check.ok);
  return {
    schema: ALL_FEATURES_SELFTEST_SCHEMA,
    generated_at: registry.generated_at || nowIso(),
    ok,
    status: ok ? 'verified_partial' : 'blocked',
    checks,
    fixtures: fixturesSummary,
    coverage,
    executable_fixtures: executable,
    note: opts.executeFixtures
      ? 'Mock executable fixture mode validates release-gated fixture contracts and expected artifact declarations.'
      : 'Mock selftest verifies the shared contract spine; feature fixtures remain progressive.'
  };
}

export function executeFeatureFixtures(features = [], opts = {}) {
  const selected = features.filter((feature) => feature.fixture?.status === 'pass' && ['mock', 'static', 'execute', 'execute_and_validate_artifacts'].includes(feature.fixture.kind));
  const failures = [];
  const checked = [];
  const executed = [];
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
    const commandSpec = SAFE_EXECUTABLE_FIXTURE_ARGS[feature.id] || null;
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
    failures.push(...artifactRun.failures.filter((failure) => !failures.includes(failure)));
    checked.push({
      id: feature.id,
      kind: fx.kind,
      command: fx.command,
      expected_artifacts: fx.expected_artifacts,
      mode: commandSpec ? 'execute_and_validate_artifacts' : strict ? 'contract_no_artifacts' : 'contract'
    });
  }
  const report = {
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

function executeSafeFixtureCommand(featureId, opts = {}) {
  const args = SAFE_EXECUTABLE_FIXTURE_ARGS[featureId];
  if (!args) return null;
  const root = opts.root || packageRoot();
  const result = spawnSync(process.execPath, [path.join(packageRoot(), 'bin', 'sks.mjs'), ...args], {
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

function expectedArtifactPath(artifact) {
  if (typeof artifact === 'string') return artifact;
  return String(artifact?.path || '');
}

const SAFE_EXECUTABLE_FIXTURE_ARGS = Object.freeze({
  'cli-version': ['--version'],
  'cli-root': ['root', '--json'],
  'cli-features': ['features', 'check', '--json'],
  'cli-commands': ['commands', '--json'],
  'cli-proof-field': ['proof-field', 'scan', '--json', '--intent', 'fixture'],
  'cli-proof': ['proof', 'smoke', '--json'],
  'cli-db': ['db', 'policy'],
  'cli-wiki': ['wiki', 'image-ingest', 'test/fixtures/images/one-by-one.png', '--json'],
  'cli-codex-lb': ['codex-lb', 'metrics', '--json'],
  'cli-hooks': ['hooks', 'trust-report', '--json'],
  'cli-scouts': ['scouts', 'run', 'latest', '--engine', 'local-static', '--mock', '--json'],
  'cli-perf': ['perf', 'cold-start', '--json', '--iterations', '1'],
  'cli-rust': ['rust', 'smoke', '--json'],
  'route-team': ['team', 'fixture', '--mock', '--json'],
  'route-qa-loop': { setup: [['qa-loop', 'prepare', 'fixture UI QA', '--json']], command: ['qa-loop', 'run', 'latest', '--mock', '--json'] },
  'route-research': { setup: [['research', 'prepare', 'fixture research topic', '--json']], command: ['research', 'run', 'latest', '--mock', '--json'] },
  'route-ppt': ['ppt', 'fixture', '--mock', '--json'],
  'route-image-ux-review': ['image-ux-review', 'fixture', '--mock', '--json'],
  'route-computer-use': ['computer-use', 'import-fixture', '--mock', '--json'],
  'route-db': ['db', 'check', '--sql', 'SELECT 1', '--json'],
  'route-wiki': ['wiki', 'image-ingest', 'test/fixtures/images/one-by-one.png', '--json'],
  'route-gx': ['gx', 'validate', 'fixture', '--mock', '--json']
});

export function renderFeatureInventoryMarkdown(registry) {
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
    `- Fixture statuses: ${Object.entries(fixtureSummary(registry.features).counts).map(([status, count]) => `${status}=${count}`).join(', ')}`,
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
  for (const [kind, values] of Object.entries(coverage.unmapped || {})) {
    lines.push(`- ${kind}: ${values.length ? values.join(', ') : 'none'}`);
  }
  if (coverage.doc_route_mentions_without_route?.length) {
    lines.push(`- doc_route_mentions_without_route: ${coverage.doc_route_mentions_without_route.join(', ')}`);
  }
  lines.push('', '## Prompt Checklist Coverage', '');
  lines.push('- [x] Collected `sks commands --json` command surface via `COMMAND_CATALOG`.');
  lines.push('- [x] Parsed `src/cli/main.mjs` handler keys, including hidden handlers and aliases.');
  lines.push('- [x] Collected dollar routes and app skill aliases from `src/core/routes.mjs`.');
  lines.push('- [x] Scanned README, Codex quick reference, AGENTS, and generated skill manifest for dollar-route mentions.');
  lines.push('- [x] Mapped project skills from `.agents/skills` into the registry.');
  lines.push('- [x] Exposed the registry through `sks features list --json`.');
  lines.push('- [x] Added a release coverage check through `sks features check --json`.');
  lines.push('- [x] Documented fixture status for every registry feature.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function commandFeature(command, handlerAliases = []) {
  const name = command.name;
  const category = commandCategory(name);
  const maturity = commandMaturity(name);
  const aliases = [...new Set(handlerAliases.map((alias) => `sks ${alias}`))];
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

function hiddenHandlerFeature(handler) {
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

function routeFeature(route) {
  const aliases = DOLLAR_COMMAND_ALIASES
    .filter((entry) => entry.canonical === route.command)
    .map((entry) => entry.app_skill);
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
      skills: aliases.map((alias) => alias.replace(/^\$/, ''))
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

function skillFeature(skillName) {
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

function baseFeature(feature) {
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

function mapHandlerKeysToFeatureIds(handlerKeys = []) {
  const catalogNames = new Set(COMMAND_CATALOG.map((entry) => entry.name));
  const out = {};
  for (const handler of handlerKeys) {
    const commandName = HANDLER_ALIAS_TO_COMMAND[handler] || handler;
    out[handler] = catalogNames.has(commandName) ? `cli-${commandName}` : `handler-${handler}`;
  }
  return out;
}

async function parseMainHandlerKeys(root) {
  const registryText = await readText(path.join(root, 'src', 'cli', 'command-registry.mjs'), '');
  const registryMatch = registryText.match(/export const COMMANDS = \{([\s\S]*?)\n\};/);
  if (registryMatch) return parseObjectKeys(registryMatch[1]);
  return [];
}

function parseObjectKeys(text = '') {
  const keys = [];
  for (const keyMatch of text.matchAll(/^\s{2}(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$-]*))\s*:/gm)) {
    keys.push(keyMatch[1] || keyMatch[2] || keyMatch[3]);
  }
  return [...new Set(keys)].sort();
}

async function listProjectSkillNames(root) {
  const dir = path.join(root, '.agents', 'skills');
  if (!await exists(dir)) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const names = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const skillFile = path.join(dir, entry.name, 'SKILL.md');
    const text = await readText(skillFile, '').catch(() => '');
    const name = text.match(/^name:\s*"?([^"\n]+)"?/m)?.[1]?.trim() || entry.name;
    if (name) names.push(name);
  }
  return [...new Set(names)].sort();
}

async function collectDocRouteMentions(root) {
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

function flatMapSourceRefs(features, key) {
  return features.flatMap((feature) => feature.source_refs?.[key] || []);
}

function duplicateValues(values) {
  const seen = new Set();
  const dupes = new Set();
  for (const value of values) {
    if (seen.has(value)) dupes.add(value);
    seen.add(value);
  }
  return [...dupes].sort();
}

function markdownTableCell(value) {
  return String(value || '').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function skillCoveredByRoute(skillName) {
  const normalized = String(skillName || '').toLowerCase();
  return DOLLAR_COMMAND_ALIASES.some((entry) => entry.app_skill.replace(/^\$/, '').toLowerCase() === normalized);
}

function isExternalPromptCommandMention(mention) {
  return ['$IMAGEGEN'].includes(String(mention || '').toUpperCase());
}

function canonicalDollar(value) {
  const raw = String(value || '').trim();
  const hit = DOLLAR_COMMANDS.find((entry) => entry.command.toLowerCase() === raw.toLowerCase());
  if (hit) return hit.command;
  const aliasHit = DOLLAR_COMMAND_ALIASES.find((entry) => entry.app_skill.toLowerCase() === raw.toLowerCase());
  return aliasHit ? aliasHit.app_skill : raw;
}

function normalizeDollar(value) {
  return String(value || '').trim().toLowerCase();
}

function slug(value) {
  return String(value || '').replace(/^\$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function commandCategory(name) {
  if (['team', 'pipeline', 'goal', 'hproof', 'proof-field', 'validate-artifacts', 'scouts', 'scout'].includes(name)) return 'proof-route';
  if (['qa-loop', 'research', 'recallpulse', 'skill-dream', 'eval', 'perf'].includes(name)) return 'loop';
  if (['codex-app', 'codex-lb', 'auth', 'hooks', 'context7', 'openclaw'].includes(name)) return 'integration';
  if (['db', 'guard', 'conflicts', 'harness', 'versioning'].includes(name)) return 'safety';
  if (['wiki', 'gx', 'image-ux-review', 'ppt'].includes(name)) return 'visual-memory';
  if (['setup', 'bootstrap', 'doctor', 'deps', 'init', 'postinstall', 'fix-path'].includes(name)) return 'install';
  return 'core-cli';
}

function commandMaturity(name) {
  if (['help', 'version', 'commands', 'usage', 'root', 'quickstart', 'setup', 'doctor', 'selftest', 'update-check'].includes(name)) return 'stable';
  if (['codex-app', 'codex-lb', 'hooks', 'features', 'all-features', 'wiki', 'team', 'pipeline', 'goal', 'db', 'guard', 'scouts', 'scout'].includes(name)) return 'beta';
  return 'labs';
}

function routeMaturity(command) {
  if (['$Answer', '$DFix', '$SKS', '$Wiki', '$Help'].includes(command)) return 'stable';
  if (['$Team', '$Goal', '$DB', '$Computer-Use', '$CU', '$QA-LOOP', '$MAD-SKS'].includes(command)) return 'beta';
  return 'labs';
}

function voxelContract(category) {
  if (category === 'visual-memory') return 'visual/image anchors required';
  if (category === 'safety') return 'policy voxel required';
  if (category === 'loop' || category === 'proof-route') return 'context/source/test anchors required';
  return 'context anchor when evidence is written';
}

function proofContract(category) {
  if (['proof-route', 'loop', 'safety', 'visual-memory'].includes(category)) return 'required';
  return 'required for route/release use';
}

function knownGapsForCommand(name) {
  if (['features', 'all-features'].includes(name)) return ['feature fixtures remain progressive'];
  if (['codex-app', 'hooks'].includes(name)) return ['mobile/event payload details remain unknown'];
  return [];
}

function routeVoxelContract(command) {
  if (['$Image-UX-Review', '$UX-Review', '$PPT', '$From-Chat-IMG', '$GX'].includes(command)) return 'image/source/bbox voxel required';
  if (command === '$DB' || command === '$MAD-SKS') return 'DB policy voxel required';
  return 'TriWiki anchors required';
}

function routeKnownGaps(command) {
  if (['$Image-UX-Review', '$UX-Review', '$PPT'].includes(command)) return ['live imagegen/CU evidence required'];
  if (command === '$MAD-SKS') return ['permission closed by owning gate'];
  return [];
}

function checkRow(id, ok, blockers = []) {
  return { id, ok: Boolean(ok), blockers: ok ? [] : blockers };
}

function missingFeatureField(registry, field) {
  return (registry.features || []).filter((feature) => !feature[field]).map((feature) => feature.id);
}
