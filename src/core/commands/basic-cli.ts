import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  COMMAND_ALIASES_LITE,
  COMMAND_MANIFEST_BY_NAME,
  type CommandManifestLiteEntry,
  type CommandNameLite
} from '../../cli/command-manifest-lite.js';
import { flag } from '../../cli/args.js';
import { printJson, sksTextLogo } from '../../cli/output.js';
import { ui as cliUi } from '../../cli/cli-theme.js';
import { PACKAGE_VERSION, ensureDir, nowIso, projectRoot, readJson, rmrf, tmpdir, writeJsonAtomic } from '../fsx.js';
import { DOLLAR_COMMANDS, sksPrefixedDollarCommand } from '../routes.js';
import { DOLLAR_COMMAND_ALIASES_LITE, DOLLAR_COMMANDS_LITE } from '../routes/dollar-manifest-lite.js';
import { initProject, normalizeInstallScope, sksCommandPrefix } from '../init.js';
import { buildFeatureRegistry, validateFeatureRegistry } from '../feature-registry.js';
import { runFeatureFixture } from '../feature-fixture-executor.js';
import { hooksExplainReport } from '../../cli/feature-commands.js';
import { writeSelftestRouteProof } from '../proof/selftest-proof-fixtures.js';
import { createMission } from '../mission.js';
import {
  formatSksUpdateStatusText,
  runSksUpdateNow,
  runSksUpdateReview,
  runSksUpdateRollback,
  runSksUpdateStatus
} from '../update-check.js';
import { persistSksUpdateNoticeFromVersions } from '../update/update-notice.js';
import { updateStageFailureDiagnostics } from '../update/update-stage-diagnostics.js';
import { withSecretPreservationGuard } from '../config/config-migration-journal.js';

/**
 * `sks help` lists the commands; `sks help <command>` prints exactly what
 * `sks <command> --help` prints; `sks help $route` describes a Codex App route.
 * A bare word is always a command name, so a retired command never resolves to
 * a route by accident (`sks help db` is unknown; `sks help '$sks-db'` is not).
 */
export async function helpCommand(args: string[] = []): Promise<unknown> {
  const topic = args.find((arg) => !arg.startsWith('-'));
  if (!topic) {
    const { helpFast } = await import('../../cli/help-fast.js');
    helpFast();
    return { ok: true, status: 'help' };
  }
  if (topic.startsWith('$')) {
    const wanted = sksPrefixedDollarCommand(topic).toLowerCase();
    const route = DOLLAR_COMMANDS.find((entry: any) => entry.command.toLowerCase() === wanted);
    if (route) {
      console.log(`${route.command}\n\n${route.route}: ${route.description}`);
      return { ok: true, status: 'help', topic: route.command };
    }
  } else {
    const name = (COMMAND_ALIASES_LITE as Record<string, string>)[topic] || topic;
    const entry = (COMMAND_MANIFEST_BY_NAME as Record<string, CommandManifestLiteEntry | undefined>)[name];
    if (entry) {
      const [{ COMMANDS }, { renderManifestHelp }] = await Promise.all([
        import('../../cli/command-registry.js'),
        import('../../cli/help.js')
      ]);
      const mod = await COMMANDS[name as CommandNameLite].lazy();
      console.log(typeof mod.usage === 'function' ? mod.usage(topic) : renderManifestHelp(name, entry));
      return { ok: true, status: 'help', topic: name };
    }
  }
  console.log(`Unknown help topic: ${topic}`);
  console.log('Topics: a command from `sks commands`, or a $ route from `sks dollar-commands` (for example `sks help \'$sks-plan\'`).');
  process.exitCode = 1;
  return { ok: false, status: 'unknown_topic', topic };
}

export async function commandsCommand(args: string[] = []): Promise<unknown> {
  const { commandsJsonFast, commandsTextFast } = await import('../../cli/commands-fast.js');
  return flag(args, '--json') ? commandsJsonFast() : commandsTextFast();
}

export function dollarCommandsCommand(args: any = []) {
  const out = { dollar_commands: DOLLAR_COMMANDS_LITE, app_skill_aliases: DOLLAR_COMMAND_ALIASES_LITE };
  if (flag(args, '--json')) return printJson(out);
  console.log(`${sksTextLogo()}\n\n$ Commands\n`);
  const width = Math.max(...DOLLAR_COMMANDS_LITE.map((entry: any) => entry.command.length));
  for (const entry of DOLLAR_COMMANDS_LITE) console.log(`${entry.command.padEnd(width)}  ${entry.route}: ${entry.description}`);
  console.log(`\nCanonical Codex App picker skills: ${DOLLAR_COMMAND_ALIASES_LITE.map((entry: any) => entry.app_skill).join(', ')}`);
  console.log('Command aliases: sks and sneakoscope are the same CLI.');
}

export function quickstartCommand() {
  console.log(`Sneakoscope Codex Quickstart

  sks setup              install hooks and skills (then once per project)
  sks doctor             check the install; sks doctor --fix repairs it
  sks commands           every CLI command
  sks dollar-commands    every Codex App $ route

Then ask Codex for work directly: the main agent does ordinary work itself while
SKS hooks keep it safe. Use $sks-plan to plan without edits, $sks-naruto or
$sks-work when you want the work split across child agents, and $sks-help for
the rest.`);
}

export async function updateStatusCommand(args: any = []) {
  const root = await resolveUpdateProjectRoot(args);
  const registry = resolveUpdateRegistry(args);
  const result = await runSksUpdateStatus({
    refresh: flag(args, '--refresh'),
    projectRoot: root,
    ...(registry ? { registry } : {})
  });
  applyUpdateCommandExitCode(result);
  if (flag(args, '--json')) return printJson(result);
  cliUi.banner('update status');
  result.update_count > 0 ? cliUi.warn(`${result.update_count} update action(s) available`) : cliUi.ok('all tracked components are current');
  console.log(`${sksTextLogo()}\n\n${formatSksUpdateStatusText(result)}`);
  return result;
}

export async function updateCheckCommand(args: any = []) {
  return updateStatusCommand(flag(args, '--refresh') ? args : [...args, '--refresh']);
}

export async function updateCommand(sub: any = 'now', args: any = []) {
  let action = String(sub || 'now').toLowerCase();
  let effectiveArgs = args;
  if (action.startsWith('-')) {
    effectiveArgs = [String(sub), ...args];
    action = 'now';
  }
  if (action === 'status') return updateStatusCommand(effectiveArgs);
  if (action === 'check') return updateCheckCommand(effectiveArgs);
  if (!['review', 'now', 'rollback'].includes(action)) {
    console.error('Usage: sks update [status|check|review|now|rollback] [--refresh] [--version <version>] [--project-root <path>] [--registry <url>] [--json] [--dry-run]');
    process.exitCode = 1;
    return;
  }
  const root = await resolveUpdateProjectRoot(effectiveArgs);
  const registry = resolveUpdateRegistry(effectiveArgs);
  const version = valueAfter(effectiveArgs, '--version') || valueAfter(effectiveArgs, '-v');
  if (action === 'review') {
    const result = await runSksUpdateReview({
      version,
      projectRoot: root,
      ...(registry ? { registry } : {}),
      json: flag(effectiveArgs, '--json'),
      quiet: flag(effectiveArgs, '--quiet'),
      timeoutMs: 10 * 60 * 1000,
      maxOutputBytes: 128 * 1024
    });
    applyUpdateCommandExitCode(result);
    if (flag(effectiveArgs, '--json')) return printJson(result);
    cliUi.banner('update review');
    result.ok ? cliUi.ok('update plan ready') : cliUi.fail('update plan unavailable');
    console.log(`Current: ${result.current}`);
    console.log(`Target: ${result.target || 'unavailable'}`);
    console.log(`Project root: ${result.project_root}`);
    console.log(`Global root: ${result.global_root || 'unavailable'}`);
    console.log(`Stages: ${result.stages.join(' -> ')}`);
    console.log(`Rollback: ${result.rollback_command}`);
    if (result.error) console.log(`Error: ${result.error}`);
    return result;
  }
  if (action === 'rollback') {
    const result = await withSecretPreservationGuard(root, 'update-rollback', async () => runSksUpdateRollback({
      version: version || '',
      dryRun: flag(effectiveArgs, '--dry-run'),
      projectRoot: root,
      ...(registry ? { registry } : {}),
      json: flag(effectiveArgs, '--json'),
      quiet: flag(effectiveArgs, '--quiet'),
      timeoutMs: 10 * 60 * 1000,
      maxOutputBytes: 128 * 1024
    }));
    if (result.update && !flag(effectiveArgs, '--dry-run')) {
      await persistSksUpdateNoticeFromVersions({
        packageName: result.update.package,
        currentVersion: result.update.new_version || result.update.from,
        latestVersion: result.update.latest,
        error: result.ok ? null : result.error
      }).catch(() => undefined);
    }
    applyUpdateCommandExitCode(result);
    if (flag(effectiveArgs, '--json')) return printJson(result);
    cliUi.banner('update rollback');
    result.ok ? cliUi.ok(result.status) : cliUi.fail(result.status || 'failed');
    console.log(`SKS rollback ${result.status}`);
    console.log(`Requested version: ${result.requested_version || 'invalid'}`);
    if (result.receipt_path) console.log(`Operation receipt: ${result.receipt_path}`);
    if (result.update?.rollback?.command) console.log(`Rollback: ${result.update.rollback.command}`);
    if (result.error) console.log(`Error: ${result.error}`);
    return result;
  }
  const result = await withSecretPreservationGuard(root, 'update-now', async () => runSksUpdateNow({
    version,
    dryRun: flag(effectiveArgs, '--dry-run'),
    projectRoot: root,
    ...(registry ? { registry } : {}),
    json: flag(effectiveArgs, '--json'),
    quiet: flag(effectiveArgs, '--quiet'),
    timeoutMs: 10 * 60 * 1000,
    maxOutputBytes: 128 * 1024
  }));
  if (!flag(effectiveArgs, '--dry-run')) {
    await persistSksUpdateNoticeFromVersions({
      packageName: result.package,
      currentVersion: result.new_version || result.from,
      latestVersion: result.latest,
      error: result.ok ? null : result.error
    }).catch(() => undefined);
  }
  applyUpdateCommandExitCode(result);
  if (flag(effectiveArgs, '--json')) return printJson(result);
  cliUi.banner('update');
  result.ok ? cliUi.ok(result.status) : result.status === 'updated_with_issues' ? cliUi.warn(result.status) : cliUi.fail(result.status || 'failed');
  console.log(`${sksTextLogo()}\n`);
  console.log(`SKS update ${result.status}`);
  if (result.command) console.log(`Command: ${result.command}`);
  if (result.global_root) console.log(`Global root: ${result.global_root}`);
  console.log(`Project root: ${result.project_root}`);
  if (result.new_binary) console.log(`New binary: ${result.new_binary}`);
  if (result.new_version) console.log(`New version: ${result.new_version}`);
  if (result.project_receipt) console.log(`Migration receipt: ${result.project_receipt.root} (${result.migration_current ? 'current' : 'not current'})`);
  // A repair the update could not finish must be NAMED, never left for the
  // user to discover on the next Doctor run (e.g. a codex-lb catalog that is
  // still stale after the bridge catalog-repair migration stage).
  for (const warning of (result.project_receipt?.optional_warnings || [])
    .filter((entry: string) => String(entry).includes('sks doctor --fix'))
    .slice(0, 3)) {
    console.log(`Follow-up: ${warning}`);
  }
  if (result.sks_menubar) console.log(`SKS menu bar: ${result.sks_menubar.status}${result.sks_menubar.app_path ? ` (${result.sks_menubar.app_path})` : ''}`);
  if (result.operation_receipt_path) console.log(`Operation receipt: ${result.operation_receipt_path}`);
  if (result.rollback?.command) console.log(`Rollback: ${result.rollback.command}`);
  for (const stage of result.stages || []) console.log(formatSksUpdateStageText(stage, result.project_root));
  if (result.verification?.length) {
    console.log('Self verification:');
    cliUi.table([
      ['check', 'status', 'detail'],
      ...result.verification.map((item) => [item.id, item.ok ? 'ok' : 'failed', item.detail || ''])
    ]);
    const remediation = [...new Set(result.verification.filter((item) => !item.ok).map((item) => item.remediation).filter((value): value is string => Boolean(value)))];
    for (const action of remediation) console.log(`Remediation: ${action}`);
  }
  if (result.error) console.log(`Error: ${result.error}`);
}

export function formatSksUpdateStageText(
  stage: { id: string; ok: boolean; status: string; detail?: Record<string, unknown> },
  projectRoot: string
): string {
  const line = `Stage ${stage.id}: ${stage.ok ? 'ok' : 'failed'} ${stage.status}`;
  const diagnostics = updateStageFailureDiagnostics(stage, projectRoot);
  return diagnostics.length ? `${line} — ${diagnostics.join('; ')}` : line;
}

export function updateCommandResultRequiresFailureExit(result: any): boolean {
  return result?.source === 'error'
    || result?.ok === false
    || result?.status === 'failed'
    || result?.status === 'terminal_uncertain';
}

function applyUpdateCommandExitCode(result: any): void {
  if (updateCommandResultRequiresFailureExit(result)) process.exitCode = 1;
}

export async function setupCommand(args: any = []) {
  // Setup has no dry run. Accepting the flag and installing anyway is how
  // `sks bootstrap --dry-run` used to change a real project.
  if (flag(args, '--dry-run')) {
    const refused = {
      schema: 'sks.setup.v1',
      ok: false,
      status: 'dry_run_unsupported',
      blockers: ['setup_has_no_dry_run'],
      next_action: '`sks doctor --json` reports what setup would repair without changing anything.'
    };
    process.exitCode = 2;
    if (flag(args, '--json')) printJson(refused);
    else console.error(`Setup has no dry run; nothing was changed. ${refused.next_action}`);
    return refused;
  }
  const root = await projectRoot();
  const { formatHarnessConflictReport, scanHarnessConflicts } = await import('../harness-conflicts.js');
  const conflictScan = await scanHarnessConflicts(root);
  if (conflictScan.hard_block) {
    const blocked = {
      schema: 'sks.setup.v1',
      ok: false,
      status: 'blocked_harness_conflict',
      root,
      blockers: conflictScan.hard.map((item: any) => `${item.name || 'harness'}:${item.path}`),
      conflicts: conflictScan.conflicts,
      cleanup_prompt_command: 'sks conflicts cleanup --yes'
    };
    process.exitCode = 1;
    if (flag(args, '--json')) {
      printJson(blocked);
      return blocked;
    }
    console.error(formatHarnessConflictReport(conflictScan, { includePrompt: false }));
    console.error('Run `sks conflicts cleanup --yes` to quarantine OMX/DCodex markers before setup.');
    return blocked;
  }
  const installScope = installScopeFromArgs(args);
  let res: any = null;
  let cliTools: any = null;
  let codexHooks: any = null;
  await withSecretPreservationGuard(root, 'setup-command', async () => {
    // User-level hooks first (a global install turns SKS on for every Codex
    // project), then setup writes project hooks only where still needed, then
    // the pinned ones get trust in the user config.
    const hookModule = await import('../codex-hooks/codex-project-hooks.js');
    const activation = installScope === 'project'
      ? null
      : await hookModule.activateSksCodexHooks({ root }).catch((err: any) => ({ ok: false, active: false, blockers: [err?.message || String(err)], warnings: [] }));
    res = await initProject(root, {
      force: flag(args, '--force'),
      installScope,
      localOnly: flag(args, '--local-only'),
      globalCommand: 'sks'
    });
    const project = await hookModule.reconcileProjectSksHooks(root, { globalActive: activation?.active === true })
      .catch((err: any) => ({ ok: false, actions: [], warnings: [], blockers: [err?.message || String(err)] }));
    codexHooks = { active: activation?.active === true, activation, project };
    const { ensureRelatedCliTools } = await import('../../cli/install-helpers.js');
    cliTools = await ensureRelatedCliTools(args);
  });
  const readiness = initProjectInstallReadiness(res);
  const result = {
    schema: 'sks.setup.v1',
    ok: readiness.ok,
    status: readiness.status,
    root,
    install_scope: installScope,
    command_prefix: sksCommandPrefix(installScope, { globalCommand: 'sks' }),
    created: res.created || [],
    local_only: flag(args, '--local-only'),
    cli_tools: cliTools,
    skill_install: res.skill_install,
    codex_hooks: codexHooks,
    blockers: readiness.blockers,
    warnings: [
      ...readiness.warnings,
      ...[...(codexHooks?.activation?.blockers || []), ...(codexHooks?.project?.blockers || [])].map((blocker: string) => `codex_hooks:${blocker}`)
    ]
  };
  if (!result.ok) process.exitCode = 1;
  if (flag(args, '--json')) {
    printJson(result);
    return result;
  }
  console.log(`${result.ok ? 'Setup complete' : 'Setup blocked'}: ${root}`);
  console.log(`Install scope: ${installScope}`);
  console.log(`Codex CLI: ${cliTools.codex.status}${cliTools.codex.version ? ` ${cliTools.codex.version}` : ''}`);
  console.log(`SKS Codex hooks: ${codexHooks?.active ? 'active for every Codex project' : installScope === 'project' ? 'this project only' : 'not active (run: sks doctor --fix)'}`);
  for (const file of result.created) console.log(`- ${file}`);
  for (const warning of result.warnings) console.log(`Warning: ${warning}`);
  for (const blocker of readiness.blockers) console.error(`Blocker: ${blocker}`);
  return result;
}

export async function bootstrapCommand(args: any = []) {
  return setupCommand(['--local-only', ...args]);
}

function initProjectInstallReadiness(res: any) {
  const manualBlockers = [
    ...(res?.codex_config_install?.manual_blockers || []),
    ...(res?.agent_install?.manual_blockers || [])
  ].map(String);
  const skillWarnings = Array.isArray(res?.skill_install?.warnings)
    ? res.skill_install.warnings.map(String)
    : [];
  const skillBlockers = res?.skill_install?.ok === false
    ? ['authoritative_sks_skill_install_failed', ...skillWarnings.map((warning: string) => `skill_install:${warning}`)]
    : [];
  const installBlockers = [
    ...(res?.codex_config_install?.ok === false && !res?.codex_config_install?.manual_blockers?.length
      ? ['codex_config_install_failed']
      : []),
    ...(res?.agent_install?.ok === false && !res?.agent_install?.manual_blockers?.length
      ? ['official_subagent_agent_install_failed']
      : [])
  ];
  const blockers = [...new Set([...manualBlockers, ...skillBlockers, ...installBlockers])];
  const warnings = [...new Set([
    ...(res?.codex_config_install?.warnings || []).map(String),
    ...(res?.agent_install?.warnings || []).map(String),
    ...skillWarnings
  ])];
  const ok = blockers.length === 0
    && res?.skill_install?.ok !== false
    && res?.codex_config_install?.ok !== false
    && res?.agent_install?.ok !== false;
  const status = manualBlockers.length
    ? 'manual_blocked'
    : skillBlockers.length
      ? 'skill_blocked'
      : installBlockers.length
        ? 'install_blocked'
        : 'completed';
  return { ok, status, blockers, warnings };
}

export async function postinstallCommand(args: any = []) {
  const { postinstall } = await import('../../cli/install-helpers.js');
  return postinstall({ bootstrap: bootstrapCommand, args });
}

export async function selftestCommand(args: any = []) {
  if (flag(args, '--real')) return selftestRealCommand(args);
  process.env.CI = 'true';
  const root = await projectRoot();
  const tmp = tmpdir('sks-selftest-');
  await ensureDir(tmp);
  try {
    const registry = await buildFeatureRegistry({ root });
    const coverage = validateFeatureRegistry(registry);
    if (!coverage.ok) throw new Error(`selftest: feature registry blocked: ${coverage.blockers.join(', ')}`);
    const mission = await createMission(tmp, { mode: 'naruto', prompt: 'selftest route proof fixture' });
    await writeSelftestRouteProof(tmp, { missionId: mission.id, kind: 'route_gate' });
    const proof = await readJson(path.join(tmp, '.sneakoscope', 'missions', mission.id, 'completion-proof.json'), null);
    if (!proof?.mission_id) throw new Error('selftest: completion proof fixture missing');
    const hookExplain = hooksExplainReport();
    if (!hookExplain.events.includes('Stop')) throw new Error('selftest: hook explain missing Stop');
    const result = {
      schema: 'sks.selftest.v1',
      ok: true,
      version: PACKAGE_VERSION,
      generated_at: nowIso(),
      checks: ['feature_registry', 'route_completion_proof_fixture', 'hooks_policy_surface'],
      tmp_root: tmp,
      tmp_cleaned: true
    };
    if (flag(args, '--json')) return printJson(result);
    console.log('SKS selftest passed');
  } finally {
    await rmrf(tmp);
  }
}

/**
 * `sks selftest --real`: actually spawns every feature fixture whose kind is
 * 'execute' or 'execute_and_validate_artifacts', derives real pass/fail status
 * from the process exit code (and, for execute_and_validate_artifacts, from
 * whether the declared expected_artifacts actually exist and match their
 * declared schema), and writes a JSON report that explicitly lists fixtures
 * skipped because they are mock/wiring_only kind rather than silently omitting
 * them. This is additive: plain `sks selftest --mock` behavior is unchanged.
 */
export async function selftestRealCommand(args: any = []) {
  process.env.CI = 'true';
  const root = await projectRoot();
  const registry = await buildFeatureRegistry({ root });
  const executableKinds = new Set(['execute', 'execute_and_validate_artifacts']);
  const results: any[] = [];
  const skippedWiringOnly: any[] = [];
  for (const feature of registry.features || []) {
    const fx = feature.fixture || {};
    if (executableKinds.has(fx.kind)) {
      const run = await runFeatureFixture(feature, { root });
      results.push(run);
    } else if (fx.kind === 'mock' || fx.kind === 'wiring_only' || fx.quality === 'wiring_only') {
      skippedWiringOnly.push({ id: feature.id, kind: fx.kind, reason: fx.reason || 'mock_or_wiring_only_kind_not_executed' });
    }
  }
  const failures = results.filter((row: any) => !row.ok);
  const ok = failures.length === 0;
  const report = {
    schema: 'sks.selftest-real.v1',
    ok,
    version: PACKAGE_VERSION,
    generated_at: nowIso(),
    root,
    checked: results.length,
    passed: results.filter((row: any) => row.ok).length,
    failed: failures.length,
    results,
    skipped_wiring_only: skippedWiringOnly,
    skipped_wiring_only_count: skippedWiringOnly.length,
    blockers: failures.flatMap((row: any) => row.blockers || [])
  };
  const reportPath = path.join(root, '.sneakoscope', 'reports', 'selftest-real-report.json');
  await writeJsonAtomic(reportPath, report);
  const output = { ...report, report_file: path.relative(root, reportPath) };
  if (flag(args, '--json')) return printJson(output);
  console.log(`SKS selftest --real: ${ok ? 'passed' : 'blocked'} (checked=${results.length}, skipped_wiring_only=${skippedWiringOnly.length})`);
  console.log(`Report: ${path.relative(root, reportPath)}`);
  if (!ok) {
    for (const blocker of report.blockers) console.log(`- ${blocker}`);
    process.exitCode = 1;
  }
  return output;
}

function installScopeFromArgs(args: any = [], fallback: any = 'global') {
  if (flag(args, '--project')) return 'project';
  if (flag(args, '--global')) return 'global';
  const index = args.indexOf('--install-scope');
  return normalizeInstallScope(index >= 0 && args[index + 1] ? args[index + 1] : fallback);
}

function valueAfter(args: any[] = [], name: string): string | null {
  const index = args.findIndex((arg: any) => String(arg) === name);
  if (index < 0) return null;
  const value = args[index + 1];
  return value === undefined ? null : String(value);
}

async function resolveUpdateProjectRoot(args: any[] = []): Promise<string> {
  const option = explicitOptionValue(args, '--project-root');
  if (!option.specified) return projectRoot();
  if (!option.value) throw new Error('update_project_root_value_required');
  const root = path.resolve(option.value);
  if (root === path.parse(root).root) throw new Error('update_project_root_filesystem_root_refused');
  const stat = await fsp.stat(root).catch(() => null);
  if (!stat?.isDirectory()) throw new Error(`update_project_root_not_directory:${root}`);
  const canonicalRoot = await fsp.realpath(root);
  if (canonicalRoot === path.parse(canonicalRoot).root) {
    throw new Error('update_project_root_filesystem_root_refused');
  }
  return canonicalRoot;
}

function explicitOptionValue(args: any[], name: string): { specified: boolean; value: string | null } {
  for (let index = 0; index < args.length; index += 1) {
    const arg = String(args[index]);
    if (arg === name) {
      const next = args[index + 1];
      const value = next === undefined || String(next).startsWith('-') ? null : String(next).trim();
      return { specified: true, value: value || null };
    }
    if (arg.startsWith(`${name}=`)) {
      const value = arg.slice(name.length + 1).trim();
      return { specified: true, value: value || null };
    }
  }
  return { specified: false, value: null };
}

function resolveUpdateRegistry(args: any[]): string | null {
  const option = explicitOptionValue(args, '--registry');
  if (!option.specified) return null;
  if (!option.value) throw new Error('update_registry_value_required');
  return option.value;
}
