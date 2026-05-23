import path from 'node:path';
import { appendJsonlBounded, exists, nowIso, packageRoot, readJson, sksRoot, writeJsonAtomic } from '../fsx.js';
import { initProject } from '../init.js';
import { createMission, setCurrent } from '../mission.js';
import { enableMadHighProfile, madHighProfileName } from '../auto-review.js';
import { permissionGateSummary } from '../permission-gates.js';
import { defaultTmuxSessionName, launchMadTmuxUi, sanitizeTmuxSessionName } from '../tmux-ui.js';
import { createMadSksAuthorizationManifest, validateMadSksAuthorizationManifest } from '../mad-sks/authorization-manifest.js';
import { createMadSksAuditLedger, madSksAuditAction, writeMadSksAuditLedger } from '../mad-sks/audit-ledger.js';
import { compareProtectedCoreSnapshots, evaluateMadSksWrite, resolveProtectedCore, snapshotProtectedCore } from '../mad-sks/immutable-harness-guard.js';
import { buildMadSksPermissionModel, parseMadSksFlags } from '../mad-sks/permission-model.js';
import { createMadSksProofEvidence, writeMadSksProofEvidence } from '../mad-sks/proof-evidence.js';
import { createMadSksRollbackPlan, writeMadSksRollbackPlan } from '../mad-sks/rollback-plan.js';

export async function madHighCommand(args: any = [], deps: any = {}) {
  const subcommand = firstSubcommand(args);
  if (subcommand) return madSksSubcommand(subcommand, args.filter((arg: any) => String(arg) !== subcommand));

  const cleanArgs = args.filter((arg: any) => !['--mad', '--MAD', '--mad-sks', '--high', '--no-auto-install-tmux'].includes(arg));
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
  const madLaunch = await activateMadTmuxPermissionState(process.cwd());
  console.log(`SKS MAD ready: ${madHighProfileName()} | gate ${madLaunch.mission_id}`);
  console.log('Live full-access active; catastrophic DB wipe/all-row/project-management guards remain.');
  const launchLb = lb.status === 'present' ? { ...lb, status: 'configured' } : lb;
  const launchOpts = codexLbImmediateLaunchOpts(cleanArgs, launchLb, { codexArgs: profile.launch_args, autoInstallTmux: !args.includes('--no-auto-install-tmux'), conciseBlockers: true });
  const workspace = readOption(cleanArgs, '--workspace', readOption(cleanArgs, '--session', launchOpts.session || `sks-mad-${defaultTmuxSessionName(process.cwd())}`));
  return launchMadTmuxUi([...cleanArgs, '--workspace', workspace], { ...launchOpts, codexArgs: profile.launch_args, autoInstallTmux: !args.includes('--no-auto-install-tmux'), conciseBlockers: true, missionId: madLaunch.mission_id });
}

async function activateMadTmuxPermissionState(cwd: any = process.cwd()) {
  const root = await sksRoot();
  if (!(await exists(path.join(root, '.sneakoscope')))) await initProject(root, {});
  const { id, dir } = await createMission(root, { mode: 'mad-sks', prompt: 'sks --mad tmux live full-access session' });
  const gate = {
    schema_version: 1,
    passed: false,
    mad_sks_permission_active: true,
    permissions_deactivated: false,
    live_server_writes_allowed: true,
    supabase_mcp_schema_cleanup_allowed: true,
    direct_execute_sql_allowed: true,
    normal_db_writes_allowed: true,
    migration_apply_allowed: true,
    catastrophic_safety_guard_active: true,
    permission_profile: permissionGateSummary(),
    activated_by: 'sks --mad',
    cwd: path.resolve(cwd || process.cwd())
  };
  await writeJsonAtomic(path.join(dir, 'mad-sks-gate.json'), gate);
  await writeJsonAtomic(path.join(dir, 'route-context.json'), { route: 'MadSKS', command: '$MAD-SKS', mode: 'MADSKS', task: gate.activated_by, mad_sks_authorization: true, tmux_launch: true, permission_profile: gate.permission_profile });
  await appendJsonlBounded(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'mad_sks.tmux_permission_opened', route: 'MadSKS', live_server_writes_allowed: true, catastrophic_safety_guard_active: true });
  await setCurrent(root, {
    mission_id: id,
    route: 'MadSKS',
    route_command: '$MAD-SKS',
    mode: 'MADSKS',
    phase: 'MADSKS_TMUX_PERMISSION_ACTIVE',
    questions_allowed: false,
    implementation_allowed: true,
    mad_sks_active: true,
    mad_sks_modifier: true,
    mad_sks_gate_file: 'mad-sks-gate.json',
    mad_sks_gate_ready: true,
    live_server_writes_allowed: true,
    supabase_mcp_schema_cleanup_allowed: true,
    direct_execute_sql_allowed: true,
    normal_db_writes_allowed: true,
    migration_apply_allowed: true,
    catastrophic_safety_guard_active: true,
    permission_profile: gate.permission_profile,
    stop_gate: 'mad-sks-gate.json',
    prompt: gate.activated_by
  });
  return { mission_id: id, dir, gate };
}

function readOption(args: any, name: any, fallback: any) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

function codexLbImmediateLaunchOpts(args: any = [], lb: any = {}, opts: any = {}) {
  const root = readOption(args, '--root', process.cwd());
  const explicitSession = readOption(args, '--session', null) || readOption(args, '--workspace', null);
  if (lb?.bypass_codex_lb) {
    const session = explicitSession || sanitizeTmuxSessionName(`sks-openai-fallback-${Date.now().toString(36)}-${defaultTmuxSessionName(root)}`);
    console.log(`codex-lb bypass active for this launch: ${lb.chain_health?.status || lb.status}`);
    console.log(`Using fresh OpenAI fallback tmux session: ${session}`);
    return { ...opts, session, codexArgs: [...(opts.codexArgs || []), '-c', 'model_provider="openai"'], codexLbBypassed: true };
  }
  if (!lb?.ok) return opts;
  const codexArgs = [...(opts.codexArgs || [])];
  if (!codexArgs.some((arg: any) => /model_provider\s*=/.test(String(arg || '')))) codexArgs.push('-c', 'model_provider="codex-lb"');
  if (explicitSession) return { ...opts, codexArgs };
  const session = sanitizeTmuxSessionName(`sks-codex-lb-${Date.now().toString(36)}-${defaultTmuxSessionName(root)}`);
  console.log(`codex-lb active for this launch: ${lb.env_path || lb.base_url || 'configured'}`);
  console.log(`Using fresh tmux session: ${session}`);
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
  'rollback-plan',
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
      protected_core: resolveProtectedCore({ packageRoot: packageRoot(), targetRoot }),
      protected_core_immutable: true,
      protected_core_write_allowed: false
    }, json);
  }

  if (subcommand === 'explain') {
    return emit({
      schema: 'sks.mad-sks-explain.v1',
      ok: true,
      summary: 'MAD-SKS is a user-authorized high-power maintenance mode. Target project work can be widened by explicit flags, while SKS harness/package/dist/scripts/schemas/release metadata remain immutable protected core.',
      command_surface: [...MAD_SKS_COMMAND_SURFACE],
      catastrophic_safeguards: permission.forbidden_scopes,
      immutable_harness_guard: 'always_on'
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
      protected_core_immutable: true,
      permission_active: false
    }, json);
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
    return materializeMadSksRun(root, targetRoot, permission, userIntent, json, { action: 'apply', authorizationManifest: validation.manifest, authorizationManifestPath: path.resolve(manifestPath) });
  }

  if (subcommand === 'run') {
    return materializeMadSksRun(root, targetRoot, permission, userIntent, json, { action: 'run' });
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
  const targetProbe = await evaluateMadSksWrite({ packageRoot: packageRoot(), targetRoot, operation: 'file_write', path: path.join(targetRoot, '.sneakoscope', 'mad-sks-target-probe') });
  const protectedProbe = await evaluateMadSksWrite({ packageRoot: packageRoot(), targetRoot, operation: 'file_write', path: path.join(packageRoot(), 'src', 'core', 'version.ts') });
  const audit = createMadSksAuditLedger({
    authorizationManifestPath: authorizationPath,
    targetRoot,
    actions: [
      madSksAuditAction({
        type: 'file_write',
        target: targetProbe.path,
        rollback_available: true,
        risk_level: 'low',
        protected_core_impact: 'none',
        notes: ['probe_only_no_target_write_performed']
      })
    ],
    blockedActions: [protectedProbe]
  });
  const rollback = createMadSksRollbackPlan({
    targetRoot,
    fileRollbacks: [{ path: targetProbe.path, previous_content_hash: null, status: 'snapshot_required_before_real_write' }],
    unavailable: permission.high_risk_confirmation_required ? ['high_risk_final_confirmation_required_before_apply'] : []
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
    changedTargetFiles: [],
    blockedActions: [protectedProbe],
    verification: [{ command: 'mad-sks protected core snapshot compare', ok: comparison.ok }]
  });
  await writeMadSksProofEvidence(proofPath, proof);
  const gate = {
    schema_version: 1,
    passed: proof.ok === true,
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
    ok: proof.ok === true,
    status: proof.status,
    mission_id: id,
    target_root: targetRoot,
    permission_model: permission,
    authorization_manifest: authorizationPath,
    audit_ledger: auditPath,
    rollback_plan: rollbackPath,
    proof_evidence: proofPath,
    protected_core_before: beforePath,
    protected_core_after: afterPath,
    protected_core_unchanged: comparison.ok === true,
    blocked_actions: [protectedProbe]
  }, json);
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
