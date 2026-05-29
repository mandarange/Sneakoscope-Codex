import path from 'node:path';
import { appendJsonlBounded, exists, nowIso, packageRoot, readJson, sksRoot, writeJsonAtomic } from '../fsx.js';
import { initProject } from '../init.js';
import { createMission, setCurrent } from '../mission.js';
import { enableMadHighProfile, madHighProfileName } from '../auto-review.js';
import { permissionGateSummary } from '../permission-gates.js';
import { launchMadZellijUi, sanitizeZellijSessionName } from '../zellij/zellij-launcher.js';
import { createMadSksAuthorizationManifest, validateMadSksAuthorizationManifest } from '../mad-sks/authorization-manifest.js';
import { createMadSksAuditLedger, madSksAuditAction, writeMadSksAuditLedger } from '../mad-sks/audit-ledger.js';
import { compareProtectedCoreSnapshots, evaluateMadSksWrite, resolveProtectedCore, snapshotProtectedCore } from '../mad-sks/immutable-harness-guard.js';
import { buildMadSksPermissionModel, parseMadSksFlags } from '../mad-sks/permission-model.js';
import { createMadSksProofEvidence, writeMadSksProofEvidence } from '../mad-sks/proof-evidence.js';
import { createMadSksRollbackPlan, writeMadSksRollbackPlan } from '../mad-sks/rollback-plan.js';
import { runMadSksExecutor } from '../mad-sks/executors/index.js';
import { applyMadSksRollbackPlan } from '../mad-sks/rollback-apply.js';
import { repairCodexConfigEperm } from '../codex/codex-config-eperm-repair.js';
import { runCodexLaunchPreflight } from '../preflight/parallel-preflight-engine.js';

export async function madHighCommand(args: any = [], deps: any = {}) {
  const subcommand = firstSubcommand(args);
  if (subcommand) return madSksSubcommand(subcommand, args.filter((arg: any) => String(arg) !== subcommand));

  const cleanArgs = args.filter((arg: any) => !madLaunchOnlyFlags().has(String(arg)));
  if (args.includes('--json')) {
    const profile = await enableMadHighProfile();
    return console.log(JSON.stringify(profile, null, 2));
  }
  const update = deps.maybePromptSksUpdateForLaunch ? await deps.maybePromptSksUpdateForLaunch(args, { label: 'MAD launch' }) : { status: 'skipped' };
  if (update.status === 'updated') {
    console.log(`SKS updated from ${deps.packageVersion} to ${update.latest}. Rerun: sks --mad`);
    return;
  }
  if (update.status === 'failed') {
    console.error(`SKS update failed: ${update.error}`);
    process.exitCode = 1;
    return;
  }
  const codexUpdate = deps.maybePromptCodexUpdateForLaunch ? await deps.maybePromptCodexUpdateForLaunch(args, { label: 'MAD launch' }) : { status: 'skipped' };
  if (codexUpdate.status === 'failed' || codexUpdate.status === 'updated_not_reflected') {
    console.error(`Codex CLI update failed: ${codexUpdate.error || 'updated version was not visible on PATH'}`);
    process.exitCode = 1;
    return;
  }
  const depStatus = deps.ensureMadLaunchDependencies ? await deps.ensureMadLaunchDependencies(args) : { ready: true, actions: [] };
  if (!depStatus.ready) {
    console.error('SKS MAD launch blocked by missing dependencies.');
    for (const action of depStatus.actions) deps.printDepsInstallAction?.(action);
    process.exitCode = 1;
    return;
  }
  const lb = deps.maybePromptCodexLbSetupForLaunch ? await deps.maybePromptCodexLbSetupForLaunch(args) : { status: 'skipped' };
  if (lb.status === 'missing_api_key') {
    process.exitCode = 1;
    return;
  }
  const profile = await enableMadHighProfile();
  const launchRoot = process.cwd();
  if (!(await exists(path.join(launchRoot, '.sneakoscope')))) await initProject(launchRoot, {});
  const launchPreflight = await runCodexLaunchPreflight(launchRoot, { fix: true, profile: profile.profile_name, sandbox: 'danger-full-access', serviceTier: 'fast' });
  if (!launchPreflight.ok) {
    console.error('SKS MAD launch blocked by config preflight.');
    for (const blocker of launchPreflight.blockers || []) console.error(`- blocker: ${blocker}`);
    for (const action of launchPreflight.operator_actions || []) console.error(`- action: ${action}`);
    process.exitCode = 1;
    return launchPreflight;
  }
  const madLaunch = await activateMadZellijPermissionState(process.cwd(), args);
  console.log(`SKS MAD ready: ${madHighProfileName()} | gate ${madLaunch.mission_id}`);
  console.log('Scoped high-power maintenance authority active; add explicit --allow-* flags for packages, services, network, browser/Computer Use, generated assets, file permissions, DB writes, or system/admin scopes. Catastrophic guards remain.');
  const launchLb = lb.status === 'present' ? { ...lb, status: 'configured' } : lb;
  const madSksEnv = {
    SKS_PROTECTED_CORE_POLICY: madLaunch.gate.protected_core_policy,
    SKS_MAD_SKS_TARGET_ROOT: madLaunch.gate.cwd,
    SKS_MAD_SKS_PROTECTED_CORE_DIGEST: madLaunch.gate.protected_core_digest
  };
  const launchOpts = codexLbImmediateLaunchOpts(cleanArgs, launchLb, { codexArgs: profile.launch_args, conciseBlockers: true, madSksEnv, launchEnv: madSksEnv });
  const workspace = readOption(cleanArgs, '--workspace', readOption(cleanArgs, '--session', launchOpts.session || `sks-mad-${sanitizeZellijSessionName(process.cwd())}`));
  const launch = await launchMadZellijUi([...cleanArgs, '--workspace', workspace], { ...launchOpts, missionId: madLaunch.mission_id, root: madLaunch.root, cwd: process.cwd(), ledgerRoot: path.join(madLaunch.dir, 'agents'), requireZellij: process.env.SKS_REQUIRE_ZELLIJ === '1' });
  if (!launch.ok) console.log(`MAD Zellij action: ${formatMadZellijAction(launch)}`);
  return launch;
}

function formatMadZellijAction(launch: any) {
  const blockers = launch.blockers?.join(', ') || launch.warnings?.join(', ') || 'check Zellij installation';
  const details = [
    ['stderr_tail', launch.launch?.stderr_tail],
    ['stdout_tail', launch.launch?.stdout_tail],
    ['create_background.stderr_tail', launch.launch?.create_background?.stderr_tail],
    ['create_background.stdout_tail', launch.launch?.create_background?.stdout_tail]
  ]
    .map(([label, value]: any[]) => [label, String(value || '').trim()])
    .filter(([, value]: any[]) => Boolean(value))
    .slice(0, 2)
    .map(([label, value]: any[]) => `${label}: ${value.replace(/\s+/g, ' ').slice(0, 360)}`);
  const detail = details.length ? ` | ${details.join(' | ')}` : '';
  const report = launch.report_path ? ` | report: ${launch.report_path}` : '';
  return `${blockers}${detail}${report}`;
}

async function activateMadZellijPermissionState(cwd: any = process.cwd(), args: any[] = []) {
  const root = await sksRoot();
  if (!(await exists(path.join(root, '.sneakoscope')))) await initProject(root, {});
  const flags = parseMadSksFlags(['--mad-sks', ...args].filter(Boolean));
  const permission = buildMadSksPermissionModel({ targetRoot: cwd, userIntent: 'sks --mad Zellij scoped high-power maintenance session', flags });
  const allowedScopes = new Set(permission.allowed_scopes || []);
  const has = (scope: string) => allowedScopes.has(scope as any);
  const dbWriteAllowed = has('db_write');
  const { id, dir } = await createMission(root, { mode: 'mad-sks', prompt: 'sks --mad Zellij scoped high-power maintenance session' });
  const protectedCore = resolveProtectedCore({ packageRoot: packageRoot(), targetRoot: cwd });
  const protectedCoreBefore = await snapshotProtectedCore(packageRoot(), 'mad-live-before');
  const protectedCorePolicyPath = path.join(dir, 'mad-sks-protected-core-policy.json');
  const protectedCoreBeforePath = path.join(dir, 'mad-sks-live-protected-core-before.json');
  await writeJsonAtomic(protectedCorePolicyPath, {
    schema: 'sks.mad-sks-live-protected-core-policy.v1',
    generated_at: nowIso(),
    target_root: path.resolve(cwd || process.cwd()),
    protected_core: protectedCore,
    immutable_harness_guard: 'always_on'
  });
  await writeJsonAtomic(protectedCoreBeforePath, protectedCoreBefore);
  const gate = {
    schema_version: 1,
    passed: false,
    mad_sks_permission_active: true,
    permissions_deactivated: false,
    authority_concept: 'user_authorized_general_permission_widening',
    target_file_writes_allowed: has('target_files'),
    shell_commands_allowed: has('shell'),
    package_install_allowed: has('package_install'),
    service_control_allowed: has('service_control'),
    network_operations_allowed: has('network'),
    computer_use_allowed: has('computer_use'),
    browser_use_allowed: has('browser_use'),
    generated_asset_edits_allowed: has('generated_assets'),
    file_permission_changes_allowed: has('file_permissions'),
    live_server_writes_allowed: has('service_control') || has('system'),
    supabase_mcp_schema_cleanup_allowed: dbWriteAllowed,
    direct_execute_sql_allowed: dbWriteAllowed,
    normal_db_writes_allowed: dbWriteAllowed,
    migration_apply_allowed: dbWriteAllowed,
    catastrophic_safety_guard_active: true,
    permission_profile: permissionGateSummary(),
    permission_model: permission,
    protected_core_policy: protectedCorePolicyPath,
    protected_core_before: protectedCoreBeforePath,
    protected_core_digest: protectedCoreBefore.digest,
    activated_by: 'sks --mad',
    cwd: path.resolve(cwd || process.cwd())
  };
  await writeJsonAtomic(path.join(dir, 'mad-sks-gate.json'), gate);
  await writeJsonAtomic(path.join(dir, 'route-context.json'), { route: 'MadSKS', command: '$MAD-SKS', mode: 'MADSKS', task: gate.activated_by, mad_sks_authorization: true, mad_sks_authority_concept: gate.authority_concept, zellij_launch: true, permission_profile: gate.permission_profile, permission_model: permission });
  await appendJsonlBounded(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'mad_sks.zellij_permission_opened', route: 'MadSKS', live_server_writes_allowed: gate.live_server_writes_allowed, allowed_scopes: permission.allowed_scopes, catastrophic_safety_guard_active: true });
  await setCurrent(root, {
    mission_id: id,
    route: 'MadSKS',
    route_command: '$MAD-SKS',
    mode: 'MADSKS',
    phase: 'MADSKS_ZELLIJ_PERMISSION_ACTIVE',
    questions_allowed: false,
    implementation_allowed: true,
    mad_sks_active: true,
    mad_sks_modifier: true,
    mad_sks_authority_concept: gate.authority_concept,
    mad_sks_gate_file: 'mad-sks-gate.json',
    mad_sks_gate_ready: true,
    mad_sks_protected_core_policy: protectedCorePolicyPath,
    mad_sks_protected_core_digest: protectedCoreBefore.digest,
    live_server_writes_allowed: gate.live_server_writes_allowed,
    supabase_mcp_schema_cleanup_allowed: gate.supabase_mcp_schema_cleanup_allowed,
    direct_execute_sql_allowed: gate.direct_execute_sql_allowed,
    normal_db_writes_allowed: gate.normal_db_writes_allowed,
    migration_apply_allowed: gate.migration_apply_allowed,
    catastrophic_safety_guard_active: true,
    permission_profile: gate.permission_profile,
    permission_model: permission,
    stop_gate: 'mad-sks-gate.json',
    prompt: gate.activated_by
  });
  return { mission_id: id, dir, gate, root };
}

function madLaunchOnlyFlags() {
  return new Set([
    '--mad',
    '--MAD',
    '--mad-sks',
    '--high',
    '--no-auto-install-zellij',
    '--allow-system',
    '--allow-db-write',
    '--allow-package-install',
    '--allow-service-control',
    '--allow-admin',
    '--allow-sudo',
    '--allow-network',
    '--allow-computer-use',
    '--allow-browser',
    '--allow-browser-use',
    '--allow-generated-assets',
    '--allow-file-permissions',
    '--allow-chmod',
    '--allow-delete',
    '--confirm-delete',
    '--confirm-destructive-delete',
    '--yes',
    '-y',
    '--dry-run',
    '--plan-only'
  ]);
}

function readOption(args: any, name: any, fallback: any) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

function codexLbImmediateLaunchOpts(args: any = [], lb: any = {}, opts: any = {}) {
  const root = readOption(args, '--root', process.cwd());
  const explicitSession = readOption(args, '--session', null) || readOption(args, '--workspace', null);
  if (lb?.bypass_codex_lb) {
    const session = explicitSession || sanitizeZellijSessionName(`sks-openai-fallback-${Date.now().toString(36)}-${path.basename(root) || 'project'}`);
    console.log(`codex-lb bypass active for this launch: ${lb.chain_health?.status || lb.status}`);
    console.log(`Using fresh OpenAI fallback Zellij session: ${session}`);
    return { ...opts, session, codexArgs: [...(opts.codexArgs || []), '-c', 'model_provider="openai"'], codexLbBypassed: true };
  }
  if (!lb?.ok) return opts;
  const codexArgs = [...(opts.codexArgs || [])];
  if (!codexArgs.some((arg: any) => /model_provider\s*=/.test(String(arg || '')))) codexArgs.push('-c', 'model_provider="codex-lb"');
  if (explicitSession) return { ...opts, codexArgs };
  const session = sanitizeZellijSessionName(`sks-codex-lb-${Date.now().toString(36)}-${path.basename(root) || 'project'}`);
  console.log(`codex-lb active for this launch: ${lb.env_path || lb.base_url || 'configured'}`);
  console.log(`Using fresh Zellij session: ${session}`);
  return { ...opts, codexArgs, session, codexLbFreshSession: true };
}

export async function madSksFixture(root: any) {
  const { id, dir } = await createMission(root, { mode: 'mad-sks', prompt: '$MAD-SKS fixture permission gate' });
  const gate = { schema_version: 1, passed: true, mad_sks_permission_active: true, permissions_deactivated: true, catastrophic_safety_guard_active: true, permission_profile: permissionGateSummary(), fixture: true };
  await writeJsonAtomic(path.join(dir, 'mad-sks-gate.json'), gate);
  return { mission_id: id, dir, gate };
}

const MAD_SKS_COMMAND_SURFACE = Object.freeze([
  'plan',
  'run',
  'apply',
  'doctor',
  'status',
  'permissions',
  'proof',
  'repair-config',
  'rollback-plan',
  'rollback-apply',
  'audit',
  'explain'
]);

async function madSksSubcommand(subcommand: string, args: any[] = []) {
  const json = args.includes('--json');
  const targetRoot = path.resolve(readOption(args, '--target-root', process.cwd()));
  const userIntent = readOption(args, '--intent', 'MAD-SKS user-authorized maintenance');
  const flags = parseMadSksFlags(['--mad-sks', subcommand === 'plan' ? '--plan-only' : '', ...args].filter(Boolean));
  const permission = buildMadSksPermissionModel({ targetRoot, userIntent, flags });
  const root = await sksRoot();

  if (subcommand === 'permissions') {
    const protectedCore = resolveProtectedCore({ packageRoot: packageRoot(), targetRoot });
    return emit({
      schema: 'sks.mad-sks-permissions.v1',
      ok: true,
      command_surface: [...MAD_SKS_COMMAND_SURFACE],
      permission_flags: [
        '--mad-sks',
        '--allow-system',
        '--allow-db-write',
        '--allow-package-install',
        '--allow-service-control',
        '--allow-admin',
        '--allow-network',
        '--allow-computer-use',
        '--allow-browser-use',
        '--allow-generated-assets',
        '--allow-file-permissions',
        '--allow-delete',
        '--confirm-delete'
      ],
      permission_model: permission,
      protected_core: protectedCore,
      protected_core_immutable: !protectedCore.engine_source_exception,
      protected_core_write_allowed: protectedCore.engine_source_exception
    }, json);
  }

  if (subcommand === 'explain') {
    return emit({
      schema: 'sks.mad-sks-explain.v1',
      ok: true,
      summary: 'MAD-SKS is a user-authorized general permission widening mode, not a DB-only unlock. Target project work can be widened by explicit flags, while SKS harness/package/dist/scripts/schemas/release metadata remain immutable protected core.',
      command_surface: [...MAD_SKS_COMMAND_SURFACE],
      catastrophic_safeguards: permission.forbidden_scopes,
      immutable_harness_guard: 'installed_harness_only_with_engine_source_exception'
    }, json);
  }

  if (subcommand === 'doctor' || subcommand === 'status') {
    const protectedCore = resolveProtectedCore({ packageRoot: packageRoot(), targetRoot });
    const before = await snapshotProtectedCore(packageRoot(), 'status');
    return emit({
      schema: subcommand === 'doctor' ? 'sks.mad-sks-doctor.v1' : 'sks.mad-sks-status.v1',
      ok: true,
      target_root: targetRoot,
      permission_model: permission,
      protected_core: protectedCore,
      protected_core_snapshot: before,
      protected_core_immutable: !protectedCore.engine_source_exception,
      protected_core_write_allowed: protectedCore.engine_source_exception,
      permission_active: false
    }, json);
  }

  if (subcommand === 'repair-config') {
    const apply = args.includes('--apply') || args.includes('--yes');
    const dryRun = args.includes('--dry-run') || !apply;
    const codexBin = readOption(args, '--codex-bin', process.env.SKS_DOCTOR_CODEX_BIN || '');
    const repair = await repairCodexConfigEperm(targetRoot, {
      fix: apply,
      codexProbe: true,
      actualCodex: true,
      requireActualCodex: args.includes('--require-actual-codex'),
      codexBin: codexBin || undefined
    });
    const legacyFlag = args.includes('--tmux-smoke') || args.includes('--require-tmux-smoke');
    const blockers = [...new Set([...(repair.blockers || []), ...(legacyFlag ? ['tmux_runtime_removed_use_zellij'] : [])])];
    const result = {
      schema: 'sks.mad-repair-config.v1',
      ok: blockers.length === 0,
      status: blockers.length ? 'blocked' : dryRun ? 'dry_run' : 'applied',
      dry_run: dryRun,
      applied: apply,
      target_root: targetRoot,
      repair,
      zellij_migration: legacyFlag ? { ok: false, reason: 'tmux runtime removed; use Zellij gates' } : { ok: true },
      blockers,
      operator_actions: [...new Set([...(repair.operator_actions || []), ...(legacyFlag ? ['Use `npm run zellij:capability` and `sks --mad` for the Zellij runtime.'] : [])])]
    };
    if (!result.ok) process.exitCode = 1;
    return emit(result, json);
  }

  if (subcommand === 'plan') {
    const manifest = createMadSksAuthorizationManifest({ permission, userIntent });
    return emit({
      schema: 'sks.mad-sks-plan.v1',
      ok: true,
      dry_run: true,
      writes_performed: false,
      permission_model: permission,
      authorization_manifest_preview: manifest,
      protected_core: resolveProtectedCore({ packageRoot: packageRoot(), targetRoot }),
      required_artifacts: [
        'mad-sks-authorization.json',
        'mad-sks-audit-ledger.json',
        'mad-sks-rollback-plan.json',
        'mad-sks-proof-evidence.json',
        'mad-sks-protected-core-before.json',
        'mad-sks-protected-core-after.json'
      ]
    }, json);
  }

  if (subcommand === 'apply') {
    const manifestPath = readOption(args, '--authorization-manifest', null);
    const manifest = manifestPath ? await readJson(path.resolve(manifestPath), null) : null;
    const validation = validateMadSksAuthorizationManifest(manifest);
    if (!validation.ok) {
      const result = {
        schema: 'sks.mad-sks-apply.v1',
        ok: false,
        status: 'blocked',
        target_root: targetRoot,
        issues: ['authorization_manifest_required', ...validation.issues],
        permission_model: permission
      };
      process.exitCode = 1;
      return emit(result, json);
    }
    return materializeMadSksRun(root, targetRoot, permission, userIntent, json, { action: 'apply', args, authorizationManifest: validation.manifest, authorizationManifestPath: path.resolve(manifestPath) });
  }

  if (subcommand === 'run') {
    return materializeMadSksRun(root, targetRoot, permission, userIntent, json, { action: 'run', args });
  }

  if (subcommand === 'rollback-apply') {
    const rollbackPlanPath = readOption(args, '--rollback-plan', readOption(args, '--plan', null));
    const result = await applyMadSksRollbackPlan({
      rollbackPlanPath,
      targetRoot,
      dryRun: args.includes('--dry-run'),
      yes: args.includes('--yes'),
      root: packageRoot()
    });
    if (!result.ok) process.exitCode = 1;
    return emit(result, json);
  }

  if (subcommand === 'rollback-plan' || subcommand === 'audit' || subcommand === 'proof') {
    const latest = await latestMadSksArtifact(root, subcommand);
    if (!latest) {
      const result = { schema: `sks.mad-sks-${subcommand}.v1`, ok: false, status: 'missing', missing: [`mad-sks-${subcommand}.json`] };
      process.exitCode = 1;
      return emit(result, json);
    }
    return emit(latest, json);
  }
}

async function materializeMadSksRun(root: string, targetRoot: string, permission: any, userIntent: string, json: boolean, opts: any = {}) {
  if (!(await exists(path.join(root, '.sneakoscope')))) await initProject(root, {});
  const { id, dir } = await createMission(root, { mode: 'mad-sks', prompt: userIntent });
  const before = await snapshotProtectedCore(packageRoot(), 'before');
  const authorization = opts.authorizationManifest || createMadSksAuthorizationManifest({ permission, userIntent });
  const authorizationPath = opts.authorizationManifestPath || path.join(dir, 'mad-sks-authorization.json');
  if (!opts.authorizationManifestPath) await writeJsonAtomic(authorizationPath, authorization);
  const args = Array.isArray(opts.args) ? opts.args : [];
  const executorId = readOption(args, '--executor', inferMadSksExecutor(args));
  const targetFile = readOption(args, '--write-file', readOption(args, '--path', path.join('.sneakoscope', 'mad-sks-target-file.txt')));
  const executorInput: any = {
    executor: executorId,
    dry_run: opts.action !== 'apply' || args.includes('--dry-run'),
    target_root: targetRoot,
    target_path: targetFile,
    path: targetFile,
    content: readOption(args, '--content', 'MAD-SKS authorized target mutation\n'),
    cwd: readOption(args, '--cwd', targetRoot),
    artifact_dir: dir,
    authorization_manifest: authorization,
    authorization_manifest_path: authorizationPath,
    permission_model: permission,
    yes: args.includes('--yes')
  };
  const operation = readOption(args, '--operation', null);
  const command = readOption(args, '--command', null);
  const argv = readRepeatedOption(args, '--argv');
  const sql = readOption(args, '--sql', null);
  const rollbackSql = readOption(args, '--rollback-sql', null);
  if (operation) executorInput.operation = operation;
  if (command) executorInput.command = command;
  if (argv) executorInput.argv = argv;
  if (sql) executorInput.sql = sql;
  if (rollbackSql) executorInput.rollback_sql = rollbackSql;
  const executorResult = await runMadSksExecutor(executorInput);
  const protectedProbe = await evaluateMadSksWrite({ packageRoot: packageRoot(), targetRoot, operation: 'file_write', path: path.join(packageRoot(), 'src', 'core', 'version.ts') });
  const audit = createMadSksAuditLedger({
    authorizationManifestPath: authorizationPath,
    targetRoot,
    actions: [
      madSksAuditAction({
        type: executorResult.action_type || 'file_write',
        target: executorResult.changed_files?.[0] || path.resolve(targetRoot, targetFile),
        rollback_available: Boolean(executorResult.rollback_plan_path),
        risk_level: executorResult.ok ? 'low' : 'high',
        protected_core_impact: 'none',
        notes: [`executor:${executorResult.executor}`, `status:${executorResult.status}`]
      })
    ],
    blockedActions: [protectedProbe, ...(executorResult.blocked_actions || [])]
  });
  const rollback = createMadSksRollbackPlan({
    targetRoot,
    authorizationManifestPath: authorizationPath,
    fileRollbacks: executorResult.rollback_plan_path ? [{ executor: executorResult.executor, rollback_plan_path: executorResult.rollback_plan_path }] : [],
    unavailable: [
      ...(permission.high_risk_confirmation_required ? ['high_risk_final_confirmation_required_before_apply'] : []),
      ...(executorResult.rollback_plan_path ? [] : ['executor_rollback_plan_missing'])
    ]
  });
  const after = await snapshotProtectedCore(packageRoot(), 'after');
  const comparison = compareProtectedCoreSnapshots(before, after);
  const auditPath = path.join(dir, 'mad-sks-audit-ledger.json');
  const rollbackPath = path.join(dir, 'mad-sks-rollback-plan.json');
  const beforePath = path.join(dir, 'mad-sks-protected-core-before.json');
  const afterPath = path.join(dir, 'mad-sks-protected-core-after.json');
  const proofPath = path.join(dir, 'mad-sks-proof-evidence.json');
  await writeJsonAtomic(beforePath, before);
  await writeJsonAtomic(afterPath, after);
  await writeJsonAtomic(path.join(dir, 'mad-sks-protected-core-comparison.json'), comparison);
  await writeMadSksAuditLedger(auditPath, audit);
  await writeMadSksRollbackPlan(rollbackPath, rollback);
  const proof = createMadSksProofEvidence({
    authorizationManifestPath: authorizationPath,
    auditLedgerPath: auditPath,
    rollbackPlanPath: rollbackPath,
    immutableHarnessGuard: protectedProbe,
    protectedCoreBefore: beforePath,
    protectedCoreAfter: afterPath,
    protectedCoreComparison: comparison,
    changedTargetFiles: executorResult.changed_files || [],
    blockedActions: [protectedProbe, ...(executorResult.blocked_actions || [])],
    verification: [
      { command: 'mad-sks executor result', ok: executorResult.ok === true, executor: executorResult.executor, status: executorResult.status },
      { command: 'mad-sks protected core snapshot compare', ok: comparison.ok }
    ]
  });
  await writeMadSksProofEvidence(proofPath, proof);
  const gate = {
    schema_version: 1,
    passed: proof.ok === true && executorResult.ok === true,
    mad_sks_permission_active: true,
    permissions_deactivated: true,
    full_system_authority: permission.mode === 'full_system_authority',
    immutable_harness_guard_passed: comparison.ok === true,
    audit_ledger: auditPath,
    rollback_plan: rollbackPath,
    proof_evidence: proofPath,
    permission_profile: permissionGateSummary()
  };
  await writeJsonAtomic(path.join(dir, 'mad-sks-gate.json'), gate);
  await setCurrent(root, {
    mission_id: id,
    route: 'MadSKS',
    route_command: '$MAD-SKS',
    mode: 'MADSKS',
    phase: 'MADSKS_PERMISSION_CLOSED',
    mad_sks_active: false,
    mad_sks_modifier: true,
    mad_sks_gate_file: 'mad-sks-gate.json',
    prompt: userIntent
  });
  return emit({
    schema: opts.action === 'apply' ? 'sks.mad-sks-apply.v1' : 'sks.mad-sks-run.v1',
    ok: proof.ok === true && executorResult.ok === true,
    status: executorResult.status,
    mission_id: id,
    target_root: targetRoot,
    permission_model: permission,
    authorization_manifest: authorizationPath,
    audit_ledger: auditPath,
    rollback_plan: rollbackPath,
    proof_evidence: proofPath,
    executor_result: executorResult,
    protected_core_before: beforePath,
    protected_core_after: afterPath,
    protected_core_unchanged: comparison.ok === true,
    blocked_actions: [protectedProbe, ...(executorResult.blocked_actions || [])]
  }, json);
}

function inferMadSksExecutor(args: any[] = []) {
  if (readOption(args, '--sql', null)) return 'db-write';
  if (readOption(args, '--command', null) || args.includes('--argv')) return 'shell-command';
  if (readOption(args, '--package', null) || args.includes('--allow-package-install')) return 'package-install';
  if (readOption(args, '--service', null) || args.includes('--allow-service-control')) return 'service-control';
  if (args.includes('--allow-computer-use')) return 'computer-use';
  if (args.includes('--allow-browser-use') || args.includes('--allow-browser')) return 'browser-use';
  if (args.includes('--allow-generated-assets')) return 'generated-asset';
  return 'file-write';
}

function readRepeatedOption(args: any[] = [], name: string) {
  const values = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] !== name) continue;
    if (args[i + 1]) values.push(String(args[i + 1]));
  }
  return values.length ? values : undefined;
}

async function latestMadSksArtifact(root: string, kind: string) {
  const current = await readJson(path.join(root, '.sneakoscope', 'current.json'), null);
  const missionId = current?.mission_id;
  if (!missionId) return null;
  const fileMap: Record<string, string> = {
    proof: 'mad-sks-proof-evidence.json',
    audit: 'mad-sks-audit-ledger.json',
    'rollback-plan': 'mad-sks-rollback-plan.json'
  };
  const file = path.join(root, '.sneakoscope', 'missions', missionId, fileMap[kind] || '');
  return readJson(file, null);
}

function firstSubcommand(args: any[] = []) {
  const found = args.find((arg) => MAD_SKS_COMMAND_SURFACE.includes(String(arg)));
  return found ? String(found) : null;
}

function emit(result: any, json: boolean) {
  if (json) return console.log(JSON.stringify(result, null, 2));
  if (result.ok === false) {
    console.error(`${result.schema}: ${result.status || 'blocked'}`);
    return;
  }
  console.log(JSON.stringify(result, null, 2));
}
