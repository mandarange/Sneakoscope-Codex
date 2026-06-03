import { projectRoot, dirSize, exists, formatBytes } from '../core/fsx.js';
import { flag } from '../cli/args.js';
import { printJson } from '../cli/output.js';
import { getCodexInfo } from '../core/codex-adapter.js';
import { rustInfo } from '../core/rust-accelerator.js';
import { codexAppIntegrationStatus } from '../core/codex-app.js';
import { codexLbMetrics, readCodexLbCircuit } from '../core/codex-lb-circuit.js';
import { ensureGlobalCodexSkillsDuringInstall, ensureGlobalCodexFastModeDuringInstall } from '../cli/install-helpers.js';
import { normalizeInstallScope } from '../core/init.js';
import { inspectCodexConfigReadability } from '../core/codex/codex-config-readability.js';
import { repairCodexConfigEperm } from '../core/codex/codex-config-eperm-repair.js';
import { writeDoctorReadinessMatrix } from '../core/doctor/doctor-readiness-matrix.js';
import { runCodexDoctorBridge, compareCodexDoctorBridge } from '../core/doctor/codex-doctor-bridge.js';
import { cleanDuplicateGlobalSksInstalls } from '../core/doctor/global-sks-install-cleanup.js';
import { checkZellijCapability } from '../core/zellij/zellij-capability.js';
import { inventoryCodexPermissionProfiles } from '../core/codex/codex-permission-profiles.js';
import { appendMigrationEvents, hashConfigText } from '../core/migration/migration-transaction-journal.js';
import { repairCodexAppFastUi } from '../core/codex-app/codex-app-fast-ui-repair.js';
import { resolveProviderContext } from '../core/provider/provider-context.js';

export async function run(_command: any, args: any = []) {
  let setupRepair = null;
  let migrationPreFix: Record<string, string | null> | null = null;
  if (flag(args, '--fix')) {
    // Snapshot config content before ANY mutation so the migration journal can
    // record real before/after hashes for the whole --fix transaction.
    migrationPreFix = await captureCodexConfigSnapshot();
    const { setupCommand } = await import('../core/commands/basic-cli.js');
    const installScope = installScopeFromArgs(args);
    // Back up the existing managed project config before --force regeneration so a
    // hand-edited .codex/config.toml is always recoverable (mirrors the splitter/structure
    // repair backup contract).
    const preFixBackup = await backupProjectConfigBeforeFix();
    const setupArgs = ['--force', '--install-scope', installScope];
    if (flag(args, '--local-only')) setupArgs.push('--local-only');
    await setupCommand(setupArgs);
    setupRepair = {
      install_scope: installScope,
      config_backup_path: preFixBackup,
      global_skills: installScope === 'global' && !flag(args, '--local-only')
        ? await ensureGlobalCodexSkillsDuringInstall({ force: true })
        : { status: 'skipped', reason: 'project or local-only repair' },
      // Re-seed the Codex App Fast-mode UI table ([user.fast_mode] visible/enabled/
      // default_profile) in the global ~/.codex/config.toml so existing installs whose
      // config predates the Fast-mode UI keys get the App speed selector back. Safe:
      // backs up + parse-validates before writing, no-op when already present.
      codex_app_fast_mode: flag(args, '--local-only')
        ? { status: 'skipped', reason: 'local-only repair' }
        : await ensureGlobalCodexFastModeDuringInstall().catch((err: any) => ({ status: 'failed', error: err?.message || String(err) }))
    };
  }
  const root = await projectRoot();
  const codexBin = readOption(args, '--codex-bin', process.env.SKS_DOCTOR_CODEX_BIN || '');
  const configProbeOpts = {
    codexProbe: flag(args, '--fix') || flag(args, '--actual-codex') || Boolean(codexBin),
    actualCodex: flag(args, '--fix') || flag(args, '--actual-codex') || Boolean(codexBin),
    requireActualCodex: flag(args, '--fix') || flag(args, '--require-actual-codex'),
    codexBin: codexBin || undefined
  };
  const codexDoctorBefore = flag(args, '--fix') ? await runCodexDoctorBridge({ codexBin: codexBin || null, cwd: root, required: flag(args, '--require-actual-codex') }).catch(() => null) : null;
  const configRepair = flag(args, '--fix') ? await repairCodexConfigEperm(root, { fix: true, ...configProbeOpts }) : null;
  const migrationJournal = flag(args, '--fix')
    ? await writeFixMigrationJournal(root, migrationPreFix, configRepair, setupRepair).catch(() => null)
    : null;
  const codexConfig = configRepair?.after || await inspectCodexConfigReadability(root, configProbeOpts);
  const codexDoctor = await runCodexDoctorBridge({ codexBin: codexBin || null, cwd: root, required: flag(args, '--require-actual-codex') });
  const codexDoctorDiff = compareCodexDoctorBridge(codexDoctorBefore, codexDoctor);
  const codex = codexBin
    ? { bin: codexBin, version: 'fixture-or-explicit', available: true }
    : await getCodexInfo().catch(() => ({ bin: null, version: null, available: false }));
  const rust: any = await rustInfo().catch((err: any) => ({
    available: false,
    mode: 'js_fallback',
    status: 'error',
    version: null,
    error: err.message
  }));
  const codexApp = await codexAppIntegrationStatus({ codex }).catch((err: any) => ({ ok: false, error: err.message }));
  const codexLb = codexLbMetrics(await readCodexLbCircuit(root).catch(() => ({})));
  const providerContext = await resolveProviderContext({ root, route: '$Doctor', serviceTier: process.env.SKS_SERVICE_TIER || 'fast' }).catch((err: any) => ({
    schema: 'sks.provider-context.v1',
    generated_at: new Date().toISOString(),
    provider: 'unknown',
    auth_mode: 'unknown',
    route: '$Doctor',
    service_tier: 'unknown',
    source: 'unknown',
    confidence: 'low',
    conflict: false,
    warnings: [err?.message || String(err)],
    signals: {
      openai_api_key_present: false,
      codex_lb_key_present: false,
      codex_lb_explicit: false,
      codex_app_auth_present: false,
      model_provider: null
    }
  }));
  const codexAppUi = await repairCodexAppFastUi(root, {
    apply: flag(args, '--fix') && flag(args, '--repair-codex-app-ui'),
    reportPath: `${root}/.sneakoscope/reports/codex-app-fast-ui-repair.json`
  }).catch((err: any) => ({
    schema: 'sks.codex-app-fast-ui-repair.v1',
    ok: false,
    fast_selector: 'manual_action_required',
    provider_selector: 'ok',
    host_owned_config: 'diagnostic_failed',
    next_action: 'Review Codex App UI config manually.',
    actions: [],
    blockers: [err?.message || String(err)]
  }));
  const zellij = await checkZellijCapability({ root, require: process.env.SKS_REQUIRE_ZELLIJ === '1' });
  const permissionProfiles = await inventoryCodexPermissionProfiles(root, { writeReport: true });
  const globalSksInstallCleanup = flag(args, '--fix') && !flag(args, '--local-only')
    ? await cleanDuplicateGlobalSksInstalls({ root, fix: true }).catch((err: any) => ({ schema: 'sks.global-sks-install-cleanup.v1', ok: false, fix: true, error: err?.message || String(err), blockers: ['global_sks_install_cleanup_exception'] }))
    : null;
  const { detectImagegenCapability } = await import('../core/imagegen/imagegen-capability.js');
  const imagegen = await detectImagegenCapability({ codexBin: codexBin || undefined }).catch((err: any) => ({ ok: false, error: err.message, auth_readiness: null }));
  const pkgBytes = await dirSize(root).catch(() => 0);
  const ready = await writeDoctorReadinessMatrix(root, {
    codex,
    codex_config: codexConfig,
    codex_app: codexApp,
    codex_lb: codexLb,
    codex_doctor: codexDoctor,
    require_codex_doctor: flag(args, '--fix') || flag(args, '--require-actual-codex'),
    zellij,
    repair: configRepair,
    codex_app_ui: codexAppUi,
    require_codex_cli_config_load: flag(args, '--fix') || flag(args, '--require-actual-codex'),
    operator_actions: [
      ...(codexConfig.operator_actions || []),
      ...(configRepair?.operator_actions || [])
    ]
  });
  const zellijReadiness = buildZellijReadiness(root, zellij as any, ready as any);
  const result = {
    schema: 'sks.doctor-status.v1',
    ok: ready.ready,
    root,
    node: { ok: Number(process.versions.node.split('.')[0]) >= 20, version: process.version },
    codex,
    codex_config: codexConfig,
    rust,
    codex_app: codexApp,
    codex_app_ui: codexAppUi,
    provider_context: providerContext,
    codex_lb: codexLb,
    codex_doctor: codexDoctor,
    codex_doctor_diff: codexDoctorDiff,
    zellij,
    zellij_readiness: zellijReadiness,
    codex_permission_profiles: permissionProfiles,
    imagegen: {
      ok: (imagegen as any).auth_readiness?.available_paths?.length > 0,
      auth_readiness: (imagegen as any).auth_readiness || null,
      codex_app_builtin_available: (imagegen as any).codex_app?.available === true
    },
    ready,
    sneakoscope: { ok: await exists(`${root}/.sneakoscope`) },
    package: { bytes: pkgBytes, human: formatBytes(pkgBytes) },
    repair: { setup: setupRepair, codex_config: configRepair, migration_journal: migrationJournal, global_sks_installs: globalSksInstallCleanup }
  };
  if (flag(args, '--json')) {
    printJson(result);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  console.log('SKS Doctor');
  console.log(`Root:      ${root}`);
  console.log(`Node:      ${result.node.ok ? 'ok' : 'fail'} ${result.node.version}`);
  console.log(`Codex:     ${codex.bin ? 'ok' : 'missing'} ${codex.version || ''}`);
  const actual = (codexConfig.checks || []).find((check: any) => check.name === 'actual_codex_cli_config_load');
  console.log('Project config:');
  console.log(`  node read:       ${ready.codex_config_readable_by_node ? 'ok' : 'failed'}`);
  console.log(`  codex cli read:  ${ready.codex_config_readable_by_codex_cli ? 'ok' : (actual?.status || 'failed')}`);
  console.log(`  removed runtime: tmux`);
  console.log('Zellij:');
  console.log(`  binary:      ${zellijReadiness.binary} ${zellijReadiness.version || ''} ${zellijReadiness.status === 'ok' ? 'ok' : zellijReadiness.status}`);
  console.log(`  required_for: ${zellijReadiness.required_for.join(', ')}`);
  console.log(`  layout:      ${zellijReadiness.layout_proof}`);
  console.log(`  pane proof:  ${zellijReadiness.pane_proof}`);
  console.log(`  screen proof:${zellijReadiness.screen_proof}`);
  console.log(`  tmux:        ${zellijReadiness.tmux_removed_runtime ? 'removed_runtime' : 'present'}`);
  console.log(`  codex doctor:    ${codexDoctor.available ? (codexDoctor.exit_code === 0 ? 'ok' : 'warning') : 'unavailable'}`);
  console.log(`Rust acc.: ${rust.mode || (rust.available ? 'rust_accelerated' : 'js_fallback')} ${rust.version || rust.status || ''}`);
  console.log(`Codex App: ${ready.codex_app_ready ? 'ok' : 'optional_missing'}`);
  console.log('Codex App UI:');
  console.log(`  fast selector: ${codexAppUi.fast_selector || 'unknown'}`);
  console.log(`  provider selector: ${codexAppUi.provider_selector || 'unknown'}`);
  console.log(`  host-owned config: ${codexAppUi.host_owned_config || 'unknown'}`);
  if (Array.isArray(codexAppUi.actions) && codexAppUi.actions.some((action: any) => action.changed)) {
    console.log('  repaired files:');
    for (const action of codexAppUi.actions.filter((entry: any) => entry.changed)) console.log(`    - ${action.file}${action.backup_path ? ` (backup ${action.backup_path})` : ''}`);
  }
  if (codexAppUi.next_action) console.log(`  next action: ${codexAppUi.next_action}`);
  console.log(`Provider: ${providerContext.provider || 'unknown'} ${providerContext.service_tier || ''} (${providerContext.source || 'unknown'}, ${providerContext.confidence || 'low'})`);
  const imagegenReady = (imagegen as any).auth_readiness;
  if (imagegenReady) {
    const paths = imagegenReady.available_paths?.length ? imagegenReady.available_paths.join(', ') : 'none';
    console.log(`Image Gen: auth=${imagegenReady.auth_mode} | headless_auto=${imagegenReady.headless_auto_available ? 'available' : 'unavailable'} | paths: ${paths}`);
    if (!imagegenReady.headless_auto_available) {
      for (const action of imagegenReady.next_actions || []) console.log(`  - ${action}`);
    }
  }
  console.log(`codex-lb:  ${codexLb.ok ? 'ok' : `warning ${codexLb.circuit?.state || 'unknown'}`}`);
  console.log(`Permissions: config profile and permission profile are tracked separately (${permissionProfiles.codex_config_profile_field}, ${permissionProfiles.codex_permission_profile_field})`);
  console.log('Ready:');
  console.log(`  cli_ready: ${ready.cli_ready ? 'yes' : 'no'}`);
  console.log(`  mad_ready: ${ready.mad_ready ? 'yes' : 'no'}`);
  console.log(`  ready:     ${ready.ready ? 'yes' : 'no'}`);
  if (!ready.ready) {
    console.log('Primary blocker:');
    console.log(`  ${ready.primary_blocker || 'unknown'}`);
  }
  if (configRepair?.repair_actions?.length) {
    console.log('What I fixed:');
    for (const action of configRepair.repair_actions) console.log(`  - ${action.name}: ${action.ok ? 'ok' : 'failed'}`);
  }
  if (migrationJournal?.journal_path) {
    console.log(`Migration journal: ${migrationJournal.journal_path} (${migrationJournal.event_count} events, ${migrationJournal.mutations_without_rollback} without rollback)`);
  }
  if (globalSksInstallCleanup) {
    console.log(`Global SKS installs: kept ${(globalSksInstallCleanup as any).kept?.length ?? 0}, removed ${(globalSksInstallCleanup as any).removed?.filter((entry: any) => entry.ok).length ?? 0}, source repo exempt ${(globalSksInstallCleanup as any).candidates?.filter((entry: any) => entry.source_repo_exempt).length ?? 0}`);
  }
  if (!ready.ready && ready.next_actions?.length) {
    console.log('What still needs you:');
    for (const action of ready.next_actions) console.log(`  - ${action}`);
  }
  if (!result.ok) process.exitCode = 1;
}

// Assemble the explicit Zellij readiness block for `doctor --json` from the
// capability probe + readiness matrix. Proof statuses are availability-derived:
// `verified` is reserved for a real environment run (SKS_REQUIRE_ZELLIJ=1 gates);
// here they report `optional` when the binary is usable and `unavailable` when
// Zellij is missing/too old. Zellij missing keeps mad_ready=false while cli_ready
// can remain true (the matrix already enforces this).
function buildZellijReadiness(root: string, zellij: any, ready: any) {
  const status = String(zellij?.status || 'missing');
  const usable = status === 'ok';
  const proofStatus = usable ? 'optional' : 'unavailable';
  const readiness: Record<string, any> = {
    schema: 'sks.zellij-readiness.v1',
    binary: zellij?.bin || 'zellij',
    status,
    min_version: zellij?.min_version || '0.41.0',
    version: zellij?.version || null,
    required_for: zellij?.required_for || ['sks --mad', 'interactive lane UI'],
    layout_proof: proofStatus,
    pane_proof: proofStatus,
    screen_proof: proofStatus,
    tmux_removed_runtime: true,
    mad_ready: ready?.mad_ready === true,
    cli_ready: ready?.cli_ready === true,
    ready_for_interactive_runtime: ready?.codex_config_readable_in_zellij_context === true
  };
  return readiness;
}

async function codexHomeConfigPath(): Promise<string> {
  const path = await import('node:path');
  const os = await import('node:os');
  const home = process.env.CODEX_HOME || path.join(process.env.HOME || os.homedir(), '.codex');
  return path.join(home, 'config.toml');
}

async function captureCodexConfigSnapshot(): Promise<Record<string, string | null>> {
  const fsp = await import('node:fs/promises');
  const path = await import('node:path');
  const read = async (p: string | null | undefined) => {
    if (!p) return null;
    try { return await fsp.readFile(p, 'utf8'); } catch { return null; }
  };
  const root = await projectRoot();
  const projectPath = root ? path.join(root, '.codex', 'config.toml') : null;
  const homePath = await codexHomeConfigPath();
  return {
    project_path: projectPath,
    project_text: await read(projectPath),
    home_path: homePath,
    home_text: await read(homePath)
  };
}

// Build a migration journal for the --fix transaction with real before/after
// content hashes and the backup paths produced by setup/structure/split repair.
async function writeFixMigrationJournal(
  root: string,
  preFix: Record<string, string | null> | null,
  configRepair: any,
  setupRepair: any
) {
  if (!preFix) return null;
  const fsp = await import('node:fs/promises');
  const read = async (p: string | null | undefined) => {
    if (!p) return null;
    try { return await fsp.readFile(p, 'utf8'); } catch { return null; }
  };
  const projectAfter = await read(preFix.project_path);
  const homeAfter = await read(preFix.home_path);
  const structureRepairs: any[] = Array.isArray(configRepair?.structure_repairs) ? configRepair.structure_repairs : [];
  const projectStructure = structureRepairs.find((repair) => repair.scope === 'project');
  const homeStructure = structureRepairs.find((repair) => repair.scope === 'codex_home');
  const events = [
    {
      step: 'doctor_fix_project_config',
      target: preFix.project_path || '.codex/config.toml',
      beforeHash: preFix.project_text != null ? hashConfigText(preFix.project_text) : null,
      afterHash: projectAfter != null ? hashConfigText(projectAfter) : null,
      backupPath: setupRepair?.config_backup_path || projectStructure?.backup_path || configRepair?.policy?.backup_path || null
    },
    {
      step: 'doctor_fix_codex_home_config',
      target: preFix.home_path || '~/.codex/config.toml',
      beforeHash: preFix.home_text != null ? hashConfigText(preFix.home_text) : null,
      afterHash: homeAfter != null ? hashConfigText(homeAfter) : null,
      backupPath: homeStructure?.backup_path || null
    }
  ].filter((event) => event.beforeHash != null || event.afterHash != null);
  if (!events.length) return null;
  return appendMigrationEvents(root, events);
}

async function backupProjectConfigBeforeFix(): Promise<string | null> {
  try {
    const fsp = await import('node:fs/promises');
    const path = await import('node:path');
    const root = await projectRoot();
    if (!root) return null;
    const configPath = path.join(root, '.codex', 'config.toml');
    if (!(await exists(configPath))) return null;
    const text = await fsp.readFile(configPath, 'utf8');
    const backupPath = `${configPath}.doctor-pre-fix-${Date.now().toString(36)}.bak`;
    await fsp.writeFile(backupPath, text);
    return backupPath;
  } catch {
    return null;
  }
}

function installScopeFromArgs(args: any = []) {
  if (flag(args, '--project')) return 'project';
  if (flag(args, '--global')) return 'global';
  const index = args.indexOf('--install-scope');
  return normalizeInstallScope(index >= 0 && args[index + 1] ? args[index + 1] : 'global');
}

function readOption(args: any = [], name: string, fallback: any = null) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}
