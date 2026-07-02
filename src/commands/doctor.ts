import os from 'node:os';
import path from 'node:path';
import { projectRoot, exists, formatBytes } from '../core/fsx.js';
import { flag } from '../cli/args.js';
import { printJson } from '../cli/output.js';
import { ui as cliUi } from '../cli/cli-theme.js';
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
import { readLocalModelConfig } from '../core/agents/ollama-worker-config.js';
import { repairAgentRoleConfigs } from '../core/agents/agent-role-config.js';
import { writeCodex0138CapabilityArtifacts } from '../core/codex-control/codex-0138-capability.js';
import { runCodex0138Doctor } from '../core/doctor/codex-0138-doctor.js';
import { writeCodexPluginInventoryArtifacts, pluginAppTemplatePolicy } from '../core/codex-plugins/codex-plugin-json.js';
import { writeMcpPluginInventoryArtifacts } from '../core/mcp/mcp-plugin-inventory.js';
import { runDoctorZellijRepair, doctorZellijRepairConsoleLine } from '../core/doctor/doctor-zellij-repair.js';
import { runDoctorContext7Repair } from '../core/doctor/doctor-context7-repair.js';
import { runDoctorCodexStartupRepair } from '../core/doctor/doctor-codex-startup-repair.js';
import { buildCodexAppHarnessMatrix } from '../core/codex-app/codex-app-harness-matrix.js';
import { buildCodexNativeFeatureMatrix } from '../core/codex-native/codex-native-feature-broker.js';
import { repairCodexNativeManagedAssets } from '../core/codex-native/codex-native-repair-transaction.js';
import { runDoctorNativeCapabilityRepair } from '../core/doctor/doctor-native-capability-repair.js';
import { runDoctorCommandAliasCleanup } from '../core/doctor/command-alias-cleanup.js';
import { repairCodexStartupConfig } from '../core/doctor/codex-startup-config-repair.js';
import { repairContext7Mcp } from '../core/doctor/context7-mcp-repair.js';
import { repairSupabaseMcp } from '../core/doctor/supabase-mcp-repair.js';
import { runDoctorFixTransaction } from '../core/doctor/doctor-transaction.js';
import { planDoctorDirtyRepair } from '../core/doctor/doctor-dirty-planner.js';
import { doctorRepairPostcheck } from '../core/doctor/doctor-repair-postcheck.js';
import { withSecretPreservationGuard } from '../core/config/config-migration-journal.js';
import { writeProjectUpdateMigrationReceipt } from '../core/update/update-migration-state.js';
import { installSksMenuBar } from '../core/codex-app/sks-menubar.js';
import { sweepSksTempDirs } from '../core/retention.js';
import { reconcileSkills } from '../core/init/skills.js';
import { codexHookTrustDoctor } from '../core/codex-hooks/codex-hook-trust-doctor.js';

export async function run(_command: any, args: any = []) {
  const root = await projectRoot();
  const doctorFix = flag(args, '--fix');
  if (!flag(args, '--json')) {
    cliUi.banner('doctor');
    cliUi.step(doctorFix ? 'repairing and validating' : 'validating');
  }
  if (doctorFix) return withSecretPreservationGuard(root, 'doctor-fix', () => runDoctor(args, root, doctorFix));
  return runDoctor(args, root, doctorFix);
}

async function runDoctor(args: any = [], root: string, doctorFix: boolean) {
  const startedAtMs = Date.now();
  const sksTempSweep = doctorFix ? await sweepSksTempDirs(root, { maxAgeHours: 24 }).catch((err: any) => ({
    ok: false,
    error: err?.message || String(err),
    actions: []
  })) : { ok: true, skipped: true, reason: 'doctor_without_fix', actions: [] };
  const doctorProfile = doctorProfileFromArgs(args, doctorFix);
  const machineOnly = flag(args, '--machine-only');
  const reportFile = readOption(args, '--report-file', null);
  const argWarnings = doctorArgWarnings(args);
  const deepDiagnostics = doctorProfile === 'full' || doctorProfile === 'capabilities';
  const codexBin = readOption(args, '--codex-bin', process.env.SKS_DOCTOR_CODEX_BIN || '');
  const actualCodexProbeRequested = flag(args, '--actual-codex') || flag(args, '--require-actual-codex') || Boolean(codexBin);
  const actualCodexProbeEnabled = deepDiagnostics || actualCodexProbeRequested;
  const requireActualCodexProbe = flag(args, '--require-actual-codex') || (deepDiagnostics && doctorFix);
  const shouldEvaluateCodexAppUiRepair = doctorFix || deepDiagnostics || flag(args, '--repair-codex-app-ui');
  const shouldRunZellijRepair = deepDiagnostics || flag(args, '--repair-zellij') || flag(args, '--install-homebrew') || process.env.SKS_REQUIRE_ZELLIJ === '1';
  const nativeCapabilityDiagnosticsRequested = deepDiagnostics || flag(args, '--repair-native-capabilities');
  const doctorPhaseIds = doctorPhaseIdsForProfile(doctorProfile);
  const doctorDirtyPlan = doctorFix ? planDoctorDirtyRepair(root, doctorPhaseIds) : null;
  let setupRepair = null;
  const sksUpdate = doctorFix
    ? {
        schema: 'sks.update-now.v2',
        ok: true,
        status: 'skipped',
        reason: 'manual_update_commands_only',
        stages: [],
        migration_current: true
      }
    : null;
  let migrationPreFix: Record<string, string | null> | null = null;
  if (doctorFix) {
    // Snapshot config content before ANY mutation so the migration journal can
    // record real before/after hashes for the whole --fix transaction.
    migrationPreFix = await captureCodexConfigSnapshot();
    const installScope = installScopeFromArgs(args);
    setupRepair = {
      schema: 'sks.doctor-setup-phase.v2',
      ok: true,
      status: 'semantic_dirty_plan_only',
      reason: 'setup_force_removed_from_doctor_hot_path',
      profile: doctorProfile,
      install_scope: installScope,
      config_backup_path: null,
      global_skills: installScope === 'global' && !flag(args, '--local-only')
        ? deepDiagnostics ? await ensureGlobalCodexSkillsDuringInstall({ force: true }) : { status: 'skipped', reason: 'default_doctor_no_global_skill_regeneration' }
        : { status: 'skipped', reason: 'project or local-only repair' },
      // Re-seed the Codex App Fast-mode UI table ([user.fast_mode] visible/enabled/
      // default_profile) in the global ~/.codex/config.toml so existing installs whose
      // config predates the Fast-mode UI keys get the App speed selector back. Safe:
      // backs up + parse-validates before writing, no-op when already present.
      codex_app_fast_mode: flag(args, '--local-only')
        ? { status: 'skipped', reason: 'local-only repair' }
        : deepDiagnostics ? await ensureGlobalCodexFastModeDuringInstall().catch((err: any) => ({ status: 'failed', error: err?.message || String(err) })) : { status: 'skipped', reason: 'default_doctor_no_global_fast_mode_regeneration' }
    };
  }
  const skillsReconcile = doctorFix
    ? {
        global: await reconcileSkills({
          targetDir: path.join(os.homedir(), '.agents', 'skills'),
          scope: 'global',
          fix: true
        }).catch((err: any) => ({ ok: false, error: err?.message || String(err) })),
        project: await reconcileSkills({
          targetDir: path.join(root, '.agents', 'skills'),
          scope: 'project',
          fix: true
        }).catch((err: any) => ({ ok: false, error: err?.message || String(err) }))
      }
    : { skipped: true, reason: 'doctor_without_fix' };
  const commandAliasCleanup = await runDoctorCommandAliasCleanup({
    root,
    fix: doctorFix
  }).catch((err: any) => ({
    schema: 'sks.command-alias-cleanup.v1',
    ok: false,
    status: 'blocked',
    root,
    fix: doctorFix,
    report_path: `${root}/.sneakoscope/reports/command-alias-cleanup.json`,
    canonical_command_count: 0,
    legacy_alias_count: 0,
    aliases: [],
    detected: { registered_alias_commands: [], catalog_alias_rows: [], missing_canonical_targets: [] },
    actions: [],
    blockers: [err?.message || String(err)]
  }));
  const doctorNativeCapabilityRepair = await runDoctorNativeCapabilityRepair({
    root,
    fix: nativeCapabilityDiagnosticsRequested && doctorFix,
    yes: flag(args, '--yes') || flag(args, '-y'),
    flags: args.map((arg: any) => String(arg)),
    skipNativeCapabilities: !nativeCapabilityDiagnosticsRequested
  }).catch((err: any) => ({
    schema: 'sks.doctor-native-capability-repair.v1',
    ok: false,
    root,
    fix: doctorFix,
    yes: flag(args, '--yes') || flag(args, '-y'),
    core_skills: null,
    skill_dedupe: null,
    native_capabilities: null,
    secret_preservation_guard: '.sneakoscope/reports/secret-preservation-guard.json',
    core_blockers: [err?.message || String(err)],
    route_blockers: {},
    optional_manual_required: [],
    optional_warnings: [],
    blockers: [err?.message || String(err)]
  }));
  const configProbeOpts = {
    codexProbe: actualCodexProbeEnabled,
    actualCodex: actualCodexProbeEnabled,
    requireActualCodex: requireActualCodexProbe,
    codexBin: codexBin || undefined
  };
  let codexStartupRepair = await runDoctorCodexStartupRepair({ root, fix: doctorFix }).catch((err: any) => ({
    schema: 'sks.doctor-codex-startup-repair.v1',
    ok: false,
    generated_at: new Date().toISOString(),
    fix: doctorFix,
    configs: [],
    agent_role_files: { sanitized: [], created: [], blockers: [err?.message || String(err)] },
    actions: [],
    manual_actions: [],
    blockers: [err?.message || String(err)],
    warnings: [],
    report_path: `${root}/.sneakoscope/reports/doctor-codex-startup-repair.json`
  }));
  const codexDoctorBefore = flag(args, '--fix') && deepDiagnostics ? await runCodexDoctorBridge({ codexBin: codexBin || null, cwd: root, required: flag(args, '--require-actual-codex') }).catch(() => null) : null;
  const configRepair = flag(args, '--fix') ? await repairCodexConfigEperm(root, { fix: true, ...configProbeOpts }) : null;
  const migrationJournal = flag(args, '--fix')
    ? await writeFixMigrationJournal(root, migrationPreFix, configRepair, setupRepair).catch(() => null)
    : null;
  let codexConfig = configRepair?.after || await inspectCodexConfigReadability(root, configProbeOpts);
  const preRepairCodexDoctor = deepDiagnostics || flag(args, '--require-actual-codex')
    ? await runCodexDoctorBridge({ codexBin: codexBin || null, cwd: root, required: flag(args, '--require-actual-codex') })
    : null;
  const codexDoctorDiff = compareCodexDoctorBridge(codexDoctorBefore, preRepairCodexDoctor);
  codexStartupRepair = mergeObservedCodexStartupWarnings(codexStartupRepair, preRepairCodexDoctor);
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
  const codexApp = deepDiagnostics
    ? await codexAppIntegrationStatus({ codex }).catch((err: any) => ({ ok: false, error: err.message }))
    : { ok: false, skipped: true, warnings: ['codex_app_optional_diagnostic_skipped'] };
  const codexLb = codexLbMetrics(await readCodexLbCircuit(root).catch(() => ({})));
  const providerContext = deepDiagnostics
    ? await resolveProviderContext({ root, route: '$Doctor', serviceTier: process.env.SKS_SERVICE_TIER || 'fast' }).catch((err: any) => ({
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
      }))
    : {
        schema: 'sks.provider-context.v1',
        generated_at: new Date().toISOString(),
        provider: 'unknown',
        auth_mode: 'unknown',
        route: '$Doctor',
        service_tier: process.env.SKS_SERVICE_TIER || 'fast',
        source: 'skipped',
        confidence: 'low',
        conflict: false,
        warnings: ['provider_context_optional_diagnostic_skipped'],
        signals: {
          openai_api_key_present: false,
          codex_lb_key_present: false,
          codex_lb_explicit: false,
          codex_app_auth_present: false,
          model_provider: null
        }
      };
  const explicitCodexAppUiRepair = flag(args, '--repair-codex-app-ui');
  const codexAppUiPlan = shouldEvaluateCodexAppUiRepair
    ? await repairCodexAppFastUi(root, {
        apply: false,
        reportPath: `${root}/.sneakoscope/reports/codex-app-fast-ui-repair-plan.json`
      }).catch((err: any) => ({
        schema: 'sks.codex-app-fast-ui-repair.v1',
        ok: false,
        apply: false,
        safe_auto_apply: false,
        requires_confirmation: true,
        fast_selector: 'manual_action_required',
        provider_selector: 'ok',
        host_owned_config: 'diagnostic_failed',
        next_action: 'Review Codex App UI config manually.',
        actions: [],
        blockers: [err?.message || String(err)]
      }))
    : {
        schema: 'sks.codex-app-fast-ui-repair.v1',
        ok: true,
        apply: false,
        skipped: true,
        safe_auto_apply: false,
        requires_confirmation: false,
        fast_selector: 'skipped_optional',
        provider_selector: 'skipped_optional',
        host_owned_config: 'not_inspected',
        next_action: 'Run `sks doctor --fix --repair-codex-app-ui` for Codex App UI repair.',
        actions: [],
        blockers: [],
        warnings: ['codex_app_ui_repair_deferred']
      };
  const shouldApplyCodexAppUiRepair = shouldEvaluateCodexAppUiRepair && doctorFix && (
    explicitCodexAppUiRepair ||
    codexAppUiPlan.safe_auto_apply === true
  );
  const codexAppUi = shouldApplyCodexAppUiRepair
    ? await repairCodexAppFastUi(root, {
        apply: true,
        force: explicitCodexAppUiRepair,
        reportPath: `${root}/.sneakoscope/reports/codex-app-fast-ui-repair.json`
      }).catch((err: any) => ({
        schema: 'sks.codex-app-fast-ui-repair.v1',
        ok: false,
        apply: true,
        safe_auto_apply: false,
        requires_confirmation: true,
        fast_selector: 'manual_action_required',
        provider_selector: 'ok',
        host_owned_config: 'diagnostic_failed',
        next_action: 'Review Codex App UI config manually.',
        actions: [],
        blockers: [err?.message || String(err)]
      }))
    : codexAppUiPlan;
  const sksMenuBar = await installSksMenuBar({
    root,
    apply: doctorFix,
    launch: doctorFix
  }).catch((err: any) => ({
    schema: 'sks.codex-app-sks-menubar.v1',
    ok: false,
    apply: doctorFix,
    status: 'blocked',
    platform: process.platform,
    app_path: null,
    executable_path: null,
    launch_agent_path: null,
    action_script_path: null,
    build_stamp_path: null,
    report_path: `${root}/.sneakoscope/reports/sks-menubar.json`,
    menu_items: [],
    actions: [],
    launch: { requested: doctorFix, method: 'none', ok: false, error: err?.message || String(err) },
    tcc_automation_status: 'unknown',
    next_actions: [
      'Run: sks menubar status',
      'Run: sks menubar install',
      'Run: sks menubar restart',
      'Rotate CODEX_LB_API_KEY and OPENROUTER_API_KEY if they were previously exposed in launchd.'
    ],
    blockers: [err?.message || String(err)],
    warnings: []
  }));
  const zellijRepair = shouldRunZellijRepair
    ? await runDoctorZellijRepair({ root, args, doctorFix }).catch((err: any) => ({
        schema: 'sks.zellij-self-heal.v1',
        ok: false,
        requested_by: 'doctor --fix',
        fix_requested: doctorFix,
        auto_approved: flag(args, '--yes') || flag(args, '-y'),
        install_homebrew_allowed: false,
        before: { status: 'unknown', version: null, bin: null },
        latest_version: null,
        strategy: 'failed',
        command: 'sks doctor --fix --yes',
        after: { status: 'unknown', version: null, bin: null },
        mutation_guard_artifact: null,
        homebrew: { present: false, bin: null, install_attempted: false, install_allowed: false },
        blockers: [err?.message || String(err)],
        warnings: []
      }))
    : {
        schema: 'sks.zellij-self-heal.v1',
        ok: true,
        skipped: true,
        requested_by: 'doctor --fix',
        fix_requested: doctorFix,
        auto_approved: false,
        install_homebrew_allowed: false,
        before: { status: 'skipped', version: null, bin: null },
        latest_version: null,
        strategy: 'deferred',
        command: 'sks doctor --fix --full --yes',
        after: { status: 'skipped', version: null, bin: null },
        mutation_guard_artifact: null,
        homebrew: { present: false, bin: null, install_attempted: false, install_allowed: false },
        blockers: [],
        warnings: ['zellij_repair_deferred_to_full_doctor_or_route_gate']
      };
  const context7Repair = await runDoctorContext7Repair({ root, fix: doctorFix }).catch((err: any) => ({
    schema: 'sks.doctor-context7-repair.v1',
    ok: false,
    generated_at: new Date().toISOString(),
    fix: doctorFix,
    preferred_transport: 'remote',
    configs: [],
    actions: [],
    blockers: [err?.message || String(err)],
    warnings: [],
    report_path: `${root}/.sneakoscope/reports/doctor-context7-repair.json`
  }));
  const startupConfigRepair = doctorFix
    ? await repairCodexStartupConfig({ root, apply: true }).catch((err: any) => ({
        schema: 'sks.codex-startup-config-repair.v1',
        ok: false,
        apply: true,
        blockers: [err?.message || String(err)]
      }))
    : null;
  const context7McpRepair = doctorFix
    ? await repairContext7Mcp({ root, apply: true }).catch((err: any) => ({
        schema: 'sks.doctor-context7-mcp-repair.v1',
        ok: false,
        apply: true,
        repaired: false,
        manual_required: false,
        blockers: [err?.message || String(err)],
        warnings: []
      }))
    : null;
  const supabaseMcpRepair = doctorFix && doctorPhaseIds.includes('supabase_mcp_repair')
    ? await repairSupabaseMcp({ root, apply: true }).catch((err: any) => ({
        schema: 'sks.doctor-supabase-mcp-repair.v1',
        ok: false,
        apply: true,
        configured: false,
        disabled: false,
        disabled_preserved: false,
        token_env_present: false,
        unsafe_write_access: false,
        read_only_migrated: false,
        write_scope_requires_confirmation: false,
        ready_blocking: true,
        manual_required: true,
        next_action: 'Review Supabase MCP configuration manually.',
        blockers: [err?.message || String(err)],
        warnings: [],
        raw_secret_values_recorded: false
      }))
    : null;
  const hookTrustRepair = doctorFix && doctorPhaseIds.includes('hook_trust_repair')
    ? await codexHookTrustDoctor(root, { fix: true, managed: true, actual: true }).catch((err: any) => ({
        schema: 'sks.codex-hook-trust-doctor.v2',
        ok: false,
        actual: true,
        blockers: [`hook_trust_repair_failed:${err?.message || String(err)}`],
        warnings: [],
        repair_actions: ['sks codex trust-doctor --fix --managed --actual']
      }))
    : null;
  const doctorFixTransaction = doctorFix
    ? await runDoctorFixTransaction({
        root,
        dirtyPlan: doctorDirtyPlan,
        phases: [
          {
            id: 'setup',
            run: async () => ({
              id: 'setup',
              ok: setupRepair !== null,
              repaired: setupRepair !== null,
              blockers: setupRepair === null ? ['setup_repair_not_recorded'] : [],
              rollback_evidence: (setupRepair as any)?.config_backup_path || 'setup_force_regeneration_idempotent_manifest'
            })
          },
          {
            id: 'codex_startup_repair',
            run: async () => ({
              id: 'codex_startup_repair',
              ok: (codexStartupRepair as any)?.ok !== false,
              repaired: doctorFix,
              blockers: (codexStartupRepair as any)?.blockers || [],
              warnings: (codexStartupRepair as any)?.warnings || [],
              rollback_evidence: (codexStartupRepair as any)?.report_path || 'codex_startup_repair_report'
            })
          },
          {
            id: 'startup_config_repair',
            run: async () => ({
              id: 'startup_config_repair',
              ok: (startupConfigRepair as any)?.ok === true,
              repaired: (startupConfigRepair as any)?.apply === true,
              blockers: (startupConfigRepair as any)?.blockers || [],
              rollback_evidence: (startupConfigRepair as any)?.backup_path || 'startup_config_repair_idempotent_report'
            })
          },
          {
            id: 'context7_repair',
            run: async () => ({
              id: 'context7_repair',
              ok: (context7Repair as any)?.ok !== false,
              repaired: doctorFix,
              blockers: (context7Repair as any)?.blockers || [],
              warnings: (context7Repair as any)?.warnings || [],
              rollback_evidence: (context7Repair as any)?.report_path || 'context7_repair_report'
            })
          },
          {
            id: 'context7_mcp_repair',
            run: async () => ({
              id: 'context7_mcp_repair',
              ok: (context7McpRepair as any)?.ok === true,
              repaired: (context7McpRepair as any)?.repaired === true,
              manual_required: (context7McpRepair as any)?.manual_required === true,
              blockers: (context7McpRepair as any)?.blockers || [],
              warnings: (context7McpRepair as any)?.warnings || [],
              rollback_evidence: (context7McpRepair as any)?.backup_path || 'context7_mcp_repair_idempotent_report'
            })
          },
          {
            id: 'supabase_mcp_repair',
            required_for_ready: false,
            run: async () => ({
              id: 'supabase_mcp_repair',
              ok: (supabaseMcpRepair as any)?.ok === true,
              repaired: false,
              manual_required: (supabaseMcpRepair as any)?.manual_required === true,
              required_for_ready: false,
              blockers: (supabaseMcpRepair as any)?.blockers || [],
              warnings: (supabaseMcpRepair as any)?.warnings || [],
              rollback_evidence: 'optional_supabase_no_ready_mutation_required'
            })
          },
          {
            id: 'hook_trust_repair',
            run: async () => ({
              id: 'hook_trust_repair',
              ok: (hookTrustRepair as any)?.ok !== false,
              repaired: doctorFix,
              blockers: (hookTrustRepair as any)?.blockers || [],
              warnings: (hookTrustRepair as any)?.warnings || [],
              rollback_evidence: (hookTrustRepair as any)?.fixed?.managed_hook_file || 'codex_hook_trust_repair_idempotent'
            })
          },
          {
            id: 'sks_menubar',
            required_for_ready: false,
            run: async () => ({
              id: 'sks_menubar',
              ok: (sksMenuBar as any)?.ok !== false,
              repaired: doctorFix && Array.isArray((sksMenuBar as any)?.actions) && (sksMenuBar as any).actions.length > 0,
              required_for_ready: false,
              blockers: (sksMenuBar as any)?.blockers || [],
              warnings: (sksMenuBar as any)?.warnings || [],
              artifact_path: (sksMenuBar as any)?.report_path || null,
              rollback_evidence: (sksMenuBar as any)?.launch_agent_path || (sksMenuBar as any)?.report_path || 'sks_menubar_optional_no_core_mutation'
            })
          },
          {
            id: 'command_alias_cleanup',
            run: async () => ({
              id: 'command_alias_cleanup',
              ok: (commandAliasCleanup as any)?.ok !== false,
              repaired: Array.isArray((commandAliasCleanup as any)?.actions) && (commandAliasCleanup as any).actions.length > 0,
              blockers: (commandAliasCleanup as any)?.blockers || [],
              rollback_evidence: (commandAliasCleanup as any)?.report_path || 'command_alias_cleanup_report'
            })
          },
          {
            id: 'native_capability_repair',
            required_for_ready: false,
            run: async () => ({
              id: 'native_capability_repair',
              ok: (doctorNativeCapabilityRepair as any)?.ok !== false,
              repaired: doctorFix,
              manual_required: Array.isArray((doctorNativeCapabilityRepair as any)?.optional_manual_required) && (doctorNativeCapabilityRepair as any).optional_manual_required.length > 0,
              required_for_ready: false,
              blockers: (doctorNativeCapabilityRepair as any)?.blockers || [],
              warnings: (doctorNativeCapabilityRepair as any)?.optional_warnings || (doctorNativeCapabilityRepair as any)?.warnings || [],
              route_blockers: (doctorNativeCapabilityRepair as any)?.route_blockers || {},
              rollback_evidence: (doctorNativeCapabilityRepair as any)?.secret_preservation_guard || 'native_capability_repair_report'
            } as any)
          }
        ].filter((phase) => doctorPhaseIds.includes(phase.id))
      }).catch((err: any) => ({
        schema: 'sks.doctor-fix-transaction.v2',
        generated_at: new Date().toISOString(),
        ok: false,
        postcheck_ok: false,
        dirty_plan: doctorDirtyPlan,
        phases: [
          {
            id: 'doctor_fix_transaction',
            ok: false,
            repaired: false,
            manual_required: false,
            blockers: [err?.message || String(err)],
            warnings: [],
            artifact_path: null,
            rollback_evidence: null
          }
        ],
        mutations_without_rollback: 0,
        rollback_performed: false,
        raw_secret_values_recorded: false
      } as any))
    : null;
  const doctorFixPostcheck = doctorFix ? doctorRepairPostcheck(doctorFixTransaction as any) : null;
  const zellij = await checkZellijCapability({ root, require: process.env.SKS_REQUIRE_ZELLIJ === '1' });
  const localModel = await readLocalModelConfig().catch(() => null);
  const permissionProfiles = await inventoryCodexPermissionProfiles(root, { writeReport: true });
  const agentRoleConfigRepair = await repairAgentRoleConfigs({
    root,
    apply: doctorFix,
    reportPath: `${root}/.sneakoscope/reports/agent-role-config-repair.json`
  }).catch((err: any) => ({
    schema: 'sks.agent-role-config-repair.v1',
    ok: false,
    apply: doctorFix,
    missing: [],
    existing: [],
    created: [],
    warnings_suppressed: false,
    blockers: [err?.message || String(err)]
  }));
  const globalSksInstallCleanup = flag(args, '--fix') && !flag(args, '--local-only')
    ? await cleanDuplicateGlobalSksInstalls({ root, fix: true }).catch((err: any) => ({ schema: 'sks.global-sks-install-cleanup.v1', ok: false, fix: true, error: err?.message || String(err), blockers: ['global_sks_install_cleanup_exception'] }))
    : null;
  const { detectImagegenCapability } = await import('../core/imagegen/imagegen-capability.js');
  const imagegen = deepDiagnostics
    ? await detectImagegenCapability({ codexBin: codexBin || undefined }).catch((err: any) => ({ ok: false, error: err.message, auth_readiness: null }))
    : { ok: false, skipped: true, auth_readiness: null, warnings: ['imagegen_optional_diagnostic_skipped'] };
  const codex0138Capability = deepDiagnostics
    ? await writeCodex0138CapabilityArtifacts(root, { codexBin: codexBin || null }).catch((err: any) => ({ error: err?.message || String(err), report: null }))
    : { skipped: true, report: null };
  const codex0138Doctor = deepDiagnostics
    ? await runCodex0138Doctor(root, { fix: doctorFix }).catch((err: any) => ({ schema: 'sks.codex-0138-doctor.v1', ok: false, error: err?.message || String(err), blockers: ['codex_0138_doctor_exception'], warnings: [] }))
    : { schema: 'sks.codex-0138-doctor.v1', ok: true, skipped: true, blockers: [], warnings: ['historical_codex_0138_doctor_skipped'] };
  const pluginInventory = deepDiagnostics
    ? await writeCodexPluginInventoryArtifacts(root).catch((err: any) => ({ error: err?.message || String(err), report: null, artifact: null }))
    : { skipped: true, report: null, artifact: null };
  const pluginPolicy = (pluginInventory as any)?.report ? pluginAppTemplatePolicy((pluginInventory as any).report) : null;
  const mcpPluginInventory = (pluginInventory as any)?.report
    ? await writeMcpPluginInventoryArtifacts(root, { inventory: (pluginInventory as any).report }).catch((err: any) => ({ error: err?.message || String(err), candidates: null }))
    : null;
  const repairCodexNative = doctorFix && doctorPhaseIds.includes('native_capability_repair');
  const codexNativeRepair = repairCodexNative
    ? await repairCodexNativeManagedAssets({
        root,
        requestedBy: 'doctor --fix',
        yes: flag(args, '--yes') || flag(args, '-y')
      }).catch((err: any) => ({
        schema: 'sks.codex-native-repair-transaction.v1',
        ok: false,
        generated_at: new Date().toISOString(),
        requested_by: 'doctor --fix',
        repaired: [],
        blockers: [err?.message || String(err)],
        warnings: []
      }))
    : null;
  const codexAppHarnessMatrix = deepDiagnostics
    ? await buildCodexAppHarnessMatrix({ root, mode: 'read-only' }).catch((err: any) => ({
        schema: 'sks.codex-app-harness-matrix.v1',
        ok: false,
        codex_cli: { available: false, version: null },
        app_features: {},
        sks_integrations: {},
        blockers: [err?.message || String(err)],
        warnings: []
      }))
    : {
        schema: 'sks.codex-app-harness-matrix.v1',
        ok: true,
        skipped: true,
        app_features: {},
        sks_integrations: {},
        blockers: [],
        warnings: ['codex_app_harness_optional_diagnostic_skipped']
      };
  const codexNativeFeatureMatrix = deepDiagnostics
    ? await buildCodexNativeFeatureMatrix({ root, mode: 'read-only' }).catch((err: any) => fallbackCodexNativeFeatureMatrix(codex, [err?.message || String(err)]))
    : fallbackCodexNativeFeatureMatrix(codex, [], ['native_feature_matrix_deferred_to_full_doctor_or_route_gate']);
  // Re-probe the Codex config AFTER the MCP transport repairs (Context7 remote
  // migration, Supabase read-only, startup config) have landed. `repairCodexConfigEperm`
  // ran its config-load probe ~before~ those repairs, so a config that those repairs
  // fix in THIS run would otherwise keep `codexConfig.ok === false`, making the doctor
  // report `cli_ready: no` / `codex_cli_config_toml_parse_error` on the very run that
  // fixed it — the endless "rerun sks doctor --fix" loop. Only re-probe when the initial
  // probe failed and we are in --fix mode, so healthy configs pay no extra probe cost.
  if (doctorFix && codexConfig?.ok === false) {
    const reinspected = await inspectCodexConfigReadability(root, configProbeOpts).catch(() => null);
    if (reinspected) codexConfig = reinspected;
  }
  const postRepairCodexDoctor = doctorFix && (deepDiagnostics || flag(args, '--require-actual-codex'))
    ? await runCodexDoctorBridge({ codexBin: codexBin || null, cwd: root, required: flag(args, '--fix') || flag(args, '--require-actual-codex') }).catch((err: any) => ({
        schema: 'sks.codex-doctor-bridge.v2',
        generated_at: new Date().toISOString(),
        available: false,
        exit_code: null,
        process_exit_code: null,
        disposition: 'block',
        semantic_ok: false,
        source_format: 'text-fallback',
        blocking_checks: [],
        warning_checks: [],
        informational_checks: [],
        environment_diagnostics_ok: false,
        git_diagnostics_ok: false,
        terminal_diagnostics_ok: false,
        app_server_diagnostics_ok: false,
        thread_inventory_ok: false,
        stdout_tail: '',
        stderr_tail: '',
        blockers: [`post_repair_codex_doctor_exception:${err?.message || String(err)}`],
        warnings: []
      } as any))
    : preRepairCodexDoctor;
  const authoritativeCodexDoctor = postRepairCodexDoctor;
  const codexDoctorAuthoritativeDiff = compareCodexDoctorBridge(codexDoctorBefore, authoritativeCodexDoctor as any);
  const pkgBytes = 0;
  const ready = await writeDoctorReadinessMatrix(root, {
    codex,
    codex_config: codexConfig,
    codex_app: codexApp,
    codex_lb: codexLb,
    codex_doctor: authoritativeCodexDoctor,
    pre_repair_codex_doctor: preRepairCodexDoctor,
    post_repair_codex_doctor: postRepairCodexDoctor,
    require_codex_doctor: deepDiagnostics || flag(args, '--require-actual-codex'),
    zellij,
    context7_repair: context7Repair,
    codex_startup_repair: codexStartupRepair,
    startup_config_repair: startupConfigRepair,
    context7_mcp_repair: context7McpRepair,
    supabase_mcp_repair: supabaseMcpRepair,
    doctor_fix_transaction: doctorFixTransaction,
    doctor_dirty_plan: doctorDirtyPlan,
    doctor_fix_postcheck: doctorFixPostcheck,
    doctor_native_capability: doctorNativeCapabilityRepair,
    local_model: localModel,
    agent_role_config: agentRoleConfigRepair,
    repair: configRepair,
    codex_app_ui: codexAppUi,
    sks_menubar: sksMenuBar,
    codex_0138_doctor: codex0138Doctor,
    codex_plugin_inventory: (pluginInventory as any)?.report || null,
    codex_plugin_app_template_policy: pluginPolicy,
    codex_app_harness_matrix: codexAppHarnessMatrix,
    require_codex_cli_config_load: requireActualCodexProbe,
    operator_actions: [
      ...(codexConfig.operator_actions || []),
      ...(configRepair?.operator_actions || []),
      ...(zellijRepair && !(zellijRepair as any).ok && (zellijRepair as any).command ? [`Run: ${(zellijRepair as any).command}`] : []),
      ...((codexStartupRepair as any).manual_actions || []),
      ...(pluginPolicy?.doctor_warnings || [])
    ]
  });
  if (doctorFix && ready.ready === true) {
    await writeProjectUpdateMigrationReceipt({
      root,
      source: `doctor-${doctorProfile}`,
      blockers: [],
      warnings: [
        ...((doctorNativeCapabilityRepair as any)?.optional_warnings || []),
        ...((doctorFixPostcheck as any)?.optional_warnings || [])
      ]
    }).catch(() => undefined);
  }
  const zellijReadiness = buildZellijReadiness(root, zellij as any, ready as any);
  const runtimeReadiness = buildRuntimeReadiness(zellijReadiness, codexNativeFeatureMatrix as any);
  const result = {
    schema: 'sks.doctor-status.v2',
    elapsed_ms: Date.now() - startedAtMs,
    ok: ready.ready && (!sksUpdate || (sksUpdate as any).ok !== false) && (commandAliasCleanup as any).ok !== false && (codexStartupRepair as any).ok !== false,
    root,
    arg_warnings: argWarnings,
    node: { ok: Number(process.versions.node.split('.')[0]) >= 20, version: process.version },
    codex,
    codex_config: codexConfig,
    rust,
    codex_app: codexApp,
    codex_app_ui: codexAppUi,
    sks_menubar: sksMenuBar,
    provider_context: providerContext,
    codex_lb: codexLb,
    codex_doctor: authoritativeCodexDoctor,
    pre_repair_codex_doctor: preRepairCodexDoctor,
    post_repair_codex_doctor: postRepairCodexDoctor,
    codex_doctor_diff: codexDoctorAuthoritativeDiff,
    observational_codex_doctor_diff: codexDoctorDiff,
    zellij,
    zellij_repair: zellijRepair,
    context7_repair: context7Repair,
    codex_startup_repair: codexStartupRepair,
    startup_config_repair: startupConfigRepair,
    context7_mcp_repair: context7McpRepair,
    supabase_mcp_repair: supabaseMcpRepair,
    doctor_fix_transaction: doctorFixTransaction,
    doctor_fix_postcheck: doctorFixPostcheck,
    postcheck: doctorFixPostcheck ? {
      ok: (doctorFixPostcheck as any).ok === true,
      pending_manual: (doctorFixPostcheck as any).pending_manual || [],
      required_blockers: (doctorFixPostcheck as any).required_blockers || [],
      optional_warnings: (doctorFixPostcheck as any).optional_warnings || []
    } : null,
    local_model: localModel,
    agent_role_config: agentRoleConfigRepair,
    zellij_readiness: zellijReadiness,
    codex_permission_profiles: permissionProfiles,
    command_aliases: commandAliasCleanup,
    sks_temp_sweep: {
      ok: (sksTempSweep as any).ok !== false,
      skipped: (sksTempSweep as any).skipped === true,
      action_count: Array.isArray((sksTempSweep as any).actions) ? (sksTempSweep as any).actions.length : 0,
      reason: (sksTempSweep as any).reason || null,
      error: (sksTempSweep as any).error || null
    },
    imagegen: {
      ok: (imagegen as any).auth_readiness?.available_paths?.length > 0,
      auth_readiness: (imagegen as any).auth_readiness || null,
      codex_app_builtin_available: (imagegen as any).codex_app?.available === true
    },
    codex_0138: {
      capability: (codex0138Capability as any).report || null,
      doctor: codex0138Doctor,
      plugins: (pluginInventory as any)?.report || null,
      plugin_app_template_policy: pluginPolicy,
      mcp_plugin_inventory: (mcpPluginInventory as any)?.candidates || null
    },
    codex_app_harness_matrix: codexAppHarnessMatrix,
    codex_native_feature_matrix: codexNativeFeatureMatrix,
    runtime_readiness: runtimeReadiness,
    ready,
    sneakoscope: { ok: await exists(`${root}/.sneakoscope`) },
    package: { bytes: pkgBytes, human: formatBytes(pkgBytes) },
    skills: skillsReconcile,
    repair: { sks_update: sksUpdate, setup: setupRepair, codex_config: configRepair, migration_journal: migrationJournal, global_sks_installs: globalSksInstallCleanup, agent_role_config: agentRoleConfigRepair, zellij: zellijRepair, context7: context7Repair, codex_startup: codexStartupRepair, startup_config: startupConfigRepair, context7_mcp: context7McpRepair, supabase_mcp: supabaseMcpRepair, hook_trust: hookTrustRepair, sks_menubar: sksMenuBar, doctor_transaction: doctorFixTransaction, doctor_dirty_plan: doctorDirtyPlan, doctor_postcheck: doctorFixPostcheck, codex_native: codexNativeRepair, doctor_native_capability: doctorNativeCapabilityRepair, command_aliases: commandAliasCleanup, skills: skillsReconcile, sks_temp_sweep: sksTempSweep }
  };
  if (reportFile) await writeJsonReportFile(reportFile, result);
  if (machineOnly && !flag(args, '--json')) {
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (flag(args, '--json')) {
    printJson(result);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  console.log('SKS Doctor');
  for (const warning of argWarnings) console.log(`Argument warning: ${warning}`);
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
  const zellijRepairLine = doctorZellijRepairConsoleLine(zellijRepair as any);
  if (zellijRepairLine) console.log(zellijRepairLine);
  console.log('Context7 MCP:');
  console.log(`  transport: ${(context7Repair as any).preferred_transport || 'remote'}`);
  console.log(`  repair: ${(context7Repair as any).ok ? 'ok' : 'blocked'}`);
  for (const action of (context7Repair as any).actions || []) console.log(`  - ${action}`);
  for (const warning of (context7Repair as any).warnings || []) console.log(`  warning: ${warning}`);
  console.log('Codex startup config:');
  console.log(`  repair: ${(codexStartupRepair as any).ok ? 'ok' : 'blocked'}`);
  for (const action of (codexStartupRepair as any).actions || []) console.log(`  - ${action}`);
  for (const action of (codexStartupRepair as any).manual_actions || []) console.log(`  manual: ${action}`);
  for (const warning of (codexStartupRepair as any).warnings || []) console.log(`  warning: ${warning}`);
  console.log(`  codex doctor:    ${formatCodexDoctorConsoleStatus(authoritativeCodexDoctor)}`);
  console.log(`Rust acc.: ${rust.mode || (rust.available ? 'rust_accelerated' : 'js_fallback')} ${rust.version || rust.status || ''}`);
  console.log(`Codex App: ${ready.codex_app_ready ? 'ok' : 'optional_missing'}`);
  console.log('SKS Runtime Readiness:');
  console.log(`  Zellij: ${runtimeReadiness.zellij}`);
  console.log(`  Codex Native: ${runtimeReadiness.codex_native}`);
  console.log(`  Loop Mesh: ${runtimeReadiness.loop_mesh}`);
  console.log(`  QA Visual: ${runtimeReadiness.qa_visual}`);
  console.log(`  Research Sources: ${runtimeReadiness.research_sources}`);
  console.log(`  Image Follow-up: ${runtimeReadiness.image_followup}`);
  for (const note of runtimeReadiness.notes) console.log(`  ${note}`);
  if (runtimeReadiness.repair_actions.length) {
    console.log('Repair actions:');
    for (const action of runtimeReadiness.repair_actions) console.log(`  - ${action}`);
  }
  const nativeCapabilityRows = Array.isArray((doctorNativeCapabilityRepair as any)?.native_capabilities?.capabilities)
    ? (doctorNativeCapabilityRepair as any).native_capabilities.capabilities
    : [];
  console.log('SKS Native Capabilities:');
  console.log(`  image generation: ${nativeCapabilityStatus(nativeCapabilityRows, 'image_generation', 'repair_required')}`);
  console.log(`  image follow-up edit: ${nativeCapabilityStatus(nativeCapabilityRows, 'image_followup_edit', 'degraded')}`);
  console.log(`  computer use: ${nativeCapabilityStatus(nativeCapabilityRows, 'computer_use', 'manual_required')}`);
  console.log(`  Chrome/web review: ${nativeCapabilityStatus(nativeCapabilityRows, 'chrome_web_review', 'manual_required')}`);
  console.log(`  app screenshot: ${nativeCapabilityStatus(nativeCapabilityRows, 'codex_app_screenshot', 'degraded')}`);
  console.log(`  app handoff: ${nativeCapabilityStatus(nativeCapabilityRows, 'app_handoff', 'unavailable')}`);
  console.log(`  image path exposure: ${nativeCapabilityStatus(nativeCapabilityRows, 'image_path_exposure', 'fallback')}`);
  const nativeManualActions = uniqueNativeManualActions(nativeCapabilityRows);
  if (nativeManualActions.length) {
    console.log('  manual next actions:');
    for (const action of nativeManualActions) console.log(`    - ${action}`);
  }
  console.log('SKS Skills:');
  console.log(`  core skills: ${doctorSkillStatus((doctorNativeCapabilityRepair as any)?.core_skills)}`);
  console.log(`  duplicate project skills: ${doctorDedupeStatus((doctorNativeCapabilityRepair as any)?.skill_dedupe)}`);
  console.log('SKS Command Aliases:');
  console.log(`  status: ${(commandAliasCleanup as any).status || ((commandAliasCleanup as any).ok ? 'clean' : 'blocked')}`);
  console.log(`  canonical commands: ${(commandAliasCleanup as any).canonical_command_count ?? 0}`);
  console.log(`  compatibility aliases: ${(commandAliasCleanup as any).legacy_alias_count ?? 0}`);
  if ((commandAliasCleanup as any).report_path) console.log(`  report: ${(commandAliasCleanup as any).report_path}`);
  console.log('Secret preservation:');
  console.log(`  Supabase keys: ${(doctorNativeCapabilityRepair as any)?.ok === false && String(((doctorNativeCapabilityRepair as any)?.blockers || []).join(' ')).includes('secret_preservation_failed') ? 'blocked' : 'preserved'}`);
  console.log('  raw secret values: never recorded');
  console.log(`  migration journal: ${(doctorNativeCapabilityRepair as any)?.secret_preservation_guard || '.sneakoscope/reports/secret-preservation-guard.json'}`);
  console.log('Codex App Harness:');
  console.log(`  plugins: ${(codexAppHarnessMatrix as any).app_features?.plugin_json ? 'ok' : 'degraded'}`);
  console.log(`  hook approval: ${(codexAppHarnessMatrix as any).app_features?.hook_approval_state_detectable ? 'ok' : 'unknown'}`);
  console.log(`  skills: ${(codexAppHarnessMatrix as any).sks_integrations?.dollar_skills_synced ? 'ok' : 'degraded'}`);
  console.log(`  agent roles: ${(codexAppHarnessMatrix as any).sks_integrations?.agent_roles_synced ? 'ok' : 'degraded'}`);
  console.log(`  native agent_type: ${(codexAppHarnessMatrix as any).app_features?.agent_type_supported ? 'ok' : 'fallback message-role'}`);
  console.log(`  init-deep memory: ${(codexAppHarnessMatrix as any).sks_integrations?.init_deep_available ? 'available' : 'missing'}`);
  console.log(`  loop mesh app profile: ${(codexAppHarnessMatrix as any).sks_integrations?.loop_mesh_app_profile_available ? 'available' : 'missing'}`);
  const codexAppUiStatus = codexAppUi as any;
  console.log('Codex App UI:');
  console.log(`  fast selector: ${codexAppUi.fast_selector || 'unknown'}`);
  console.log(`  provider selector: ${codexAppUi.provider_selector || 'unknown'}`);
  if (Array.isArray(codexAppUiStatus.provider_blockers) && codexAppUiStatus.provider_blockers.length) {
    console.log(`  provider blockers: ${codexAppUiStatus.provider_blockers.join(', ')}`);
  }
  if (Array.isArray(codexAppUiStatus.provider_actions) && codexAppUiStatus.provider_actions.length) {
    console.log('  provider actions:');
    for (const action of codexAppUiStatus.provider_actions) console.log(`    - ${action}`);
  }
  console.log(`  host-owned config: ${codexAppUi.host_owned_config || 'unknown'}`);
  if (Array.isArray(codexAppUi.actions) && codexAppUi.actions.some((action: any) => action.changed)) {
    console.log('  repaired files:');
    for (const action of codexAppUi.actions.filter((entry: any) => entry.changed)) console.log(`    - ${action.file}${action.backup_path ? ` (backup ${action.backup_path})` : ''}`);
  }
  if (codexAppUi.next_action) console.log(`  next action: ${codexAppUi.next_action}`);
  console.log('SKS Menu Bar:');
  console.log(`  status: ${(sksMenuBar as any).status || ((sksMenuBar as any).ok ? 'ok' : 'blocked')}`);
  if ((sksMenuBar as any).app_path) console.log(`  app: ${(sksMenuBar as any).app_path}`);
  if ((sksMenuBar as any).launch_agent_path) console.log(`  launch agent: ${(sksMenuBar as any).launch_agent_path}`);
  if (Array.isArray((sksMenuBar as any).blockers) && (sksMenuBar as any).blockers.length) console.log(`  blockers: ${(sksMenuBar as any).blockers.join(', ')}`);
  if (Array.isArray((sksMenuBar as any).warnings) && (sksMenuBar as any).warnings.length) console.log(`  warnings: ${(sksMenuBar as any).warnings.join(', ')}`);
  console.log(`Provider: ${providerContext.provider || 'unknown'} ${providerContext.service_tier || ''} (${providerContext.source || 'unknown'}, ${providerContext.confidence || 'low'})`);
  const imagegenReady = (imagegen as any).auth_readiness;
  if (imagegenReady) {
    const paths = imagegenReady.available_paths?.length ? imagegenReady.available_paths.join(', ') : 'none';
    console.log(`Image Gen: auth=${imagegenReady.auth_mode} | headless_auto=${imagegenReady.headless_auto_available ? 'available' : 'unavailable'} | paths: ${paths}`);
    if (!imagegenReady.headless_auto_available) {
      for (const action of imagegenReady.next_actions || []) console.log(`  - ${action}`);
    }
  }
  const codex0138 = (codex0138Capability as any).report || {};
  console.log('Codex current compatibility:');
  console.log(`  target: rust-v0.142.0`);
  console.log(`  runtime: ${codex.version || 'unknown'}`);
  console.log(`  multi-agent mode: ${(codexNativeFeatureMatrix as any).features?.multi_agent_mode?.ok ? 'verified' : 'unverified'}`);
  console.log(`  rollout budget: ${(codexNativeFeatureMatrix as any).features?.rollout_budget?.ok ? 'verified' : 'unverified'}`);
  console.log(`  indexed search: ${(codexNativeFeatureMatrix as any).features?.indexed_web_search?.ok ? 'verified' : 'unverified'}`);
  console.log(`  current time: ${(codexNativeFeatureMatrix as any).features?.current_time_read?.ok ? 'verified' : 'unverified'}`);
  console.log('Historical compatibility: Codex 0.138 features:');
  console.log(`  /app handoff: ${codex0138.supports_app_handoff ? 'ok' : 'unavailable'}`);
  console.log(`  plugin JSON: ${codex0138.supports_plugin_json ? 'ok' : 'unavailable'}`);
  console.log(`  image path exposure: ${codex0138.supports_image_path_exposure ? 'ok' : 'unavailable'}`);
  console.log(`  OAuth MCP pre-refresh: ${codex0138.supports_oauth_mcp_prerefresh ? 'ok' : 'unavailable'}`);
  const plugins = (pluginInventory as any)?.report?.plugins || [];
  const remoteMcpCount = plugins.flatMap((plugin: any) => plugin.remote_mcp_servers || []).length;
  const unavailableTemplates = pluginPolicy?.unavailable_app_templates?.length || 0;
  console.log(`Codex plugins: ${(pluginInventory as any)?.report ? 'ok' : 'warning'}`);
  console.log(`  Remote MCP servers: ${remoteMcpCount} candidates`);
  console.log(`  Unavailable app templates: ${unavailableTemplates}`);
  for (const warning of pluginPolicy?.doctor_warnings || []) console.log(`  warning: ${warning}`);
  if ((codex0138Doctor as any)?.fixed?.length) console.log(`  doctor --fix repaired: ${(codex0138Doctor as any).fixed.join(', ')}`);
  console.log(`codex-lb:  ${codexLb.ok ? 'ok' : `warning ${codexLb.circuit?.state || 'unknown'}`}`);
  if (localModel) {
    console.log('Local LLM:');
    console.log(`  enabled: ${localModel.enabled ? 'yes' : 'no'}`);
    console.log(`  status: ${localModel.status}`);
    console.log(`  provider: ${localModel.provider}`);
    console.log(`  model: ${localModel.model}`);
    console.log(`  endpoint: ${localModel.base_url}`);
    console.log(`  last smoke: ${localModel.last_smoke?.ok ? `ok ${localModel.last_smoke.latency_ms || 0}ms ${localModel.last_smoke.tokens_per_second || 0} tok/s` : 'missing'}`);
    console.log('  final arbiter: GPT required');
  }
  console.log(`Permissions: config profile and permission profile are tracked separately (${permissionProfiles.codex_config_profile_field}, ${permissionProfiles.codex_permission_profile_field})`);
  console.log('Ready:');
  console.log(`  cli_ready: ${ready.cli_ready ? 'yes' : 'no'}`);
  console.log(`  mad_ready: ${ready.mad_ready ? 'yes' : 'no'}`);
  console.log(`  managed_state_current: ${ready.managed_state_current ? 'yes' : 'no'}`);
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
  if (sksUpdate) {
    console.log(`SKS update: ${(sksUpdate as any).status}${(sksUpdate as any).latest ? ` latest ${(sksUpdate as any).latest}` : ''}${(sksUpdate as any).error ? ` (${(sksUpdate as any).error})` : ''}`);
  }
  if (globalSksInstallCleanup) {
    console.log(`Global SKS installs: kept ${(globalSksInstallCleanup as any).kept?.length ?? 0}, removed ${(globalSksInstallCleanup as any).removed?.filter((entry: any) => entry.ok).length ?? 0}, source repo exempt ${(globalSksInstallCleanup as any).candidates?.filter((entry: any) => entry.source_repo_exempt).length ?? 0}`);
    if ((globalSksInstallCleanup as any).npm_cache) console.log(`NPM cache cleanup: ${(globalSksInstallCleanup as any).npm_cache.status}`);
  }
  if (!ready.ready && ready.next_actions?.length) {
    console.log('What still needs you:');
    for (const action of ready.next_actions) console.log(`  - ${action}`);
  }
  if (!result.ok) process.exitCode = 1;
}

function buildRuntimeReadiness(zellijReadiness: any, matrix: any) {
  const defaults = matrix?.invocation_defaults || {};
  const hookPolicy = defaults.hook_evidence_policy || 'unknown-do-not-count';
  const agentStrategy = defaults.loop_worker_role_strategy || 'message-role';
  const multiAgentMode = defaults.multi_agent_mode || 'none';
  const rolloutBudget = defaults.rollout_budget_strategy || 'sks-local-only';
  const researchSource = defaults.research_source_strategy || 'local-files';
  const zellijStatus = zellijReadiness?.status === 'ok'
    ? 'ok'
    : zellijReadiness?.cli_ready ? 'headless_available' : 'repair_required';
  const codexNative = matrix?.ok === true
    ? 'ok'
    : matrix?.codex_cli?.available ? 'degraded' : 'blocked';
  const repairActions: string[] = [];
  if (zellijStatus !== 'ok') {
    repairActions.push('Zellij: sks doctor --fix --yes');
    repairActions.push('Homebrew + Zellij: sks doctor --fix --install-homebrew --yes');
  }
  if (codexNative !== 'ok') repairActions.push('Codex Native managed assets: sks doctor --fix --repair-codex-native --yes');
  if (matrix?.features?.project_memory?.ok !== true) repairActions.push('Project memory: sks codex-native init-deep --apply --directory-local');
  return {
    schema: 'sks.runtime-readiness-story.v1',
    zellij: zellijStatus,
    codex_native: codexNative,
    loop_mesh: agentStrategy === 'agent_type' ? 'ok' : 'fallback',
    qa_visual: defaults.qa_visual_review_strategy || 'blocked',
    research_sources: researchSource,
    image_followup: defaults.image_followup_strategy || 'blocked',
    hook_evidence_policy: hookPolicy,
    agent_role_strategy: agentStrategy,
    multi_agent_mode: multiAgentMode,
    rollout_budget_strategy: rolloutBudget,
    current_time_source: defaults.current_time_source || 'external-clock',
    overload_retry_policy: defaults.overload_retry_policy || 'generic',
    notes: [
      ...(zellijStatus === 'headless_available' ? ['MAD can run with --headless; live panes require repair'] : []),
      ...(hookPolicy !== 'approved-only' ? ['hook-derived evidence will not count'] : []),
      ...(agentStrategy !== 'agent_type' ? ['message-role fallback active'] : []),
      ...(multiAgentMode === 'proactive' ? ['Codex 0.142 multi-agent proactive mode available for Naruto-style routes'] : []),
      ...(rolloutBudget === 'codex-0142-shared' ? ['Codex 0.142 rollout budget can be recorded in route proof'] : []),
      ...(researchSource === 'indexed-web-search' ? ['Codex 0.142 indexed web search selected for source-intelligence routes'] : [])
    ],
    repair_actions: [...new Set(repairActions)]
  };
}

function fallbackCodexNativeFeatureMatrix(codex: any, blockers: string[] = [], warnings: string[] = []) {
  return {
    schema: 'sks.codex-native-feature-matrix.v1',
    ok: blockers.length === 0,
    skipped: blockers.length === 0,
    codex_cli: { available: Boolean(codex?.bin || codex?.available), version: codex?.version || null, bin: codex?.bin || null },
    features: {},
    invocation_defaults: {
      loop_worker_role_strategy: 'message-role',
      multi_agent_mode: 'none',
      rollout_budget_strategy: 'sks-local-only',
      qa_visual_review_strategy: 'route-gated',
      research_source_strategy: 'local-files',
      image_followup_strategy: 'artifact-path',
      hook_evidence_policy: 'unknown-do-not-count',
      skill_bridge_strategy: 'cli-only',
      current_time_source: 'external-clock',
      overload_retry_policy: 'generic'
    },
    blockers,
    warnings
  };
}

type DoctorProfile = 'fast' | 'fix' | 'migration' | 'full' | 'capabilities';

export function doctorProfileFromArgs(args: any[] = [], doctorFix = false): DoctorProfile {
  const explicit = readOption(args, '--profile', null);
  if (explicit === 'migration' || explicit === 'full' || explicit === 'capabilities' || explicit === 'fast' || explicit === 'fix') return explicit;
  if (flag(args, '--full')) return 'full';
  if (flag(args, '--capabilities')) return 'capabilities';
  return doctorFix ? 'fix' : 'fast';
}

export function doctorArgWarnings(args: any[] = []): string[] {
  const warnings: string[] = [];
  const explicit = readOption(args, '--profile', null);
  if (explicit && !['migration', 'full', 'capabilities', 'fast', 'fix'].includes(String(explicit))) {
    warnings.push(`unknown_profile:${explicit}; supported profiles: migration, full, capabilities, fast, fix`);
  }
  for (const flag of unknownDoctorFlags(args)) warnings.push(`unknown_flag:${flag}`);
  return warnings;
}

function unknownDoctorFlags(args: any[] = []): string[] {
  const knownBoolean = new Set([
    '--fix', '--yes', '-y', '--machine-only', '--actual-codex', '--require-actual-codex',
    '--full', '--capabilities', '--repair-codex-app-ui', '--repair-zellij', '--install-homebrew',
    '--repair-native-capabilities', '--repair-codex-native', '--local-only', '--project', '--global',
    '--dry-run', '--json'
  ]);
  const knownValue = new Set(['--profile', '--report-file', '--codex-bin', '--install-scope']);
  const unknown: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = String(args[index] || '');
    if (!arg.startsWith('-')) continue;
    if (knownValue.has(arg)) {
      index += 1;
      continue;
    }
    if (knownBoolean.has(arg)) continue;
    unknown.push(arg);
  }
  return unknown;
}

function doctorPhaseIdsForProfile(profile: DoctorProfile): string[] {
  const required = [
    'codex_startup_repair',
    'startup_config_repair',
    'context7_repair',
    'context7_mcp_repair',
    'hook_trust_repair',
    'command_alias_cleanup'
  ];
  if (profile === 'migration') return required;
  const optional = ['supabase_mcp_repair', 'native_capability_repair', 'sks_menubar'];
  if (profile === 'full' || profile === 'capabilities') return ['setup', ...required, ...optional];
  return [...required, ...optional];
}

async function writeJsonReportFile(file: string, value: unknown): Promise<void> {
  const fsp = await import('node:fs/promises');
  const path = await import('node:path');
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function nativeCapabilityStatus(rows: any[], id: string, fallback: string): string {
  const row = rows.find((entry: any) => entry?.id === id);
  if (!row) return fallback;
  if (row.after === 'verified' || row.before === 'verified') return 'verified';
  if (id === 'image_path_exposure') {
    if (row.before === 'degraded' || row.after === 'degraded' || row.repairability === 'doctor-fix') return 'fallback';
    return fallback;
  }
  if (id === 'app_handoff') return 'unavailable';
  if (row.repairability === 'manual-required') return 'manual_required';
  if (row.before === 'degraded' || row.after === 'degraded') return 'degraded';
  if (row.repairability === 'doctor-fix') return row.after === 'blocked' ? 'blocked' : 'repair_required';
  if (row.repairability === 'unavailable') return 'unavailable';
  return fallback;
}

function uniqueNativeManualActions(rows: any[]): string[] {
  return [...new Set(rows
    .filter((row: any) => row?.repairability === 'manual-required' && row?.after !== 'verified')
    .flatMap((row: any) => Array.isArray(row.repair_actions) ? row.repair_actions : [])
    .filter((action: any) => typeof action === 'string' && action.trim()))];
}

function doctorSkillStatus(coreSkills: any): string {
  if (!coreSkills) return 'drift_detected';
  if (Array.isArray(coreSkills.restored) && coreSkills.restored.length) return 'repaired';
  if (Array.isArray(coreSkills.blockers) && coreSkills.blockers.length) return 'drift_detected';
  return 'current';
}

function doctorDedupeStatus(skillDedupe: any): string {
  if (!skillDedupe) return 'manual_required';
  if (Array.isArray(skillDedupe.actions) && skillDedupe.actions.some((action: any) => action.action === 'quarantined')) return 'repaired';
  if (Array.isArray(skillDedupe.blockers) && skillDedupe.blockers.length) return 'manual_required';
  return 'none';
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

export function formatCodexDoctorConsoleStatus(report: any) {
  if (!report || report.available !== true) return 'unavailable';
  return report.disposition || (report.exit_code === 0 ? 'pass' : 'warn');
}

function mergeObservedCodexStartupWarnings(startupRepair: any, codexDoctor: any) {
  const text = `${codexDoctor?.stdout_tail || ''}\n${codexDoctor?.stderr_tail || ''}`;
  const manual = new Set<string>(Array.isArray(startupRepair?.manual_actions) ? startupRepair.manual_actions : []);
  const warnings = new Set<string>(Array.isArray(startupRepair?.warnings) ? startupRepair.warnings : []);
  const blockers = new Set<string>(Array.isArray(startupRepair?.blockers) ? startupRepair.blockers : []);
  if (/codex_apps[\s\S]{0,500}token_expired|token_expired[\s\S]{0,500}codex_apps/i.test(text)) {
    manual.add('Codex Apps MCP token is expired; sign in to Codex App/CLI again so the connector can mint a fresh token.');
    warnings.add('codex_apps_token_expired_observed');
    blockers.add('codex_apps_token_expired_manual_reauth_required');
  }
  if (/SUPABASE_ACCESS_TOKEN[\s\S]{0,500}mcp server ['"`]?supabase['"`]?|mcp server ['"`]?supabase['"`]?[\s\S]{0,500}SUPABASE_ACCESS_TOKEN/i.test(text)) {
    manual.add('Supabase MCP uses SUPABASE_ACCESS_TOKEN but the variable is unset; export the token or migrate that server to a read-only remote URL.');
    warnings.add('supabase_access_token_missing_observed');
    blockers.add('supabase_access_token_missing_manual_auth_required');
  }
  if (/node_repl[\s\S]{0,500}No such file or directory|No such file or directory[\s\S]{0,500}node_repl/i.test(text)) {
    warnings.add('node_repl_missing_command_observed');
  }
  return {
    ...startupRepair,
    ok: blockers.size === 0 && startupRepair?.ok !== false,
    manual_actions: [...manual],
    warnings: [...warnings],
    blockers: [...blockers]
  };
}
