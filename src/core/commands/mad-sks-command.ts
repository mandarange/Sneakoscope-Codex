import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { PACKAGE_VERSION, appendJsonlBounded, exists, nowIso, packageRoot, readJson, sksRoot, writeJsonAtomic } from '../fsx.js';
import { initProject } from '../init.js';
import { createMission, findLatestMission, missionDir, setCurrent, stateFile } from '../mission.js';
import { buildMadHighLaunchProfileNoWrite, madHighProfileName } from '../auto-review.js';
import { permissionGateSummary } from '../permission-gates.js';
import { attachZellijSessionInteractive, launchMadZellijUi, sanitizeZellijSessionName } from '../zellij/zellij-launcher.js';
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
import { diffCodexAppUiSnapshots, writeCodexAppUiSnapshot } from '../codex-app/codex-app-ui-state-snapshot.js';
import { checkSksUpdateNotice } from '../update/update-notice.js';
import { writeCodex0138CapabilityArtifacts } from '../codex-control/codex-0138-capability.js';
import { writeCodex0139CapabilityArtifacts } from '../codex-control/codex-0139-capability.js';
import { resolveCodexNativeInvocationPlan } from '../codex-native/codex-native-invocation-router.js';
import { repairZellijForSks } from '../zellij/zellij-self-heal.js';
import {
  buildMadGlmLaunchArtifact,
  buildMadGlmLaunchProfileNoWrite,
  resolveMadGlmLaunchKey,
  writeMadGlmCodexWrapper
} from '../providers/glm/glm-mad-launch.js';
import { GLM_MAD_MODE } from '../providers/glm/glm-52-settings.js';
import { assertNonGlmMadRoute } from '../routes/model-mode-router.js';
import { evaluateGate } from '../stop-gate/gate-evaluator.js';

const MAD_SKS_DEFAULT_TTL_MS = 10 * 60 * 1000;

export async function madHighCommand(args: any = [], deps: any = {}) {
  const rawArgsForHelp = (args || []).map((arg: any) => String(arg));
  // 20차 P2-2: --help previously fell through to the full MAD launch flow
  // below (dependency checks, update prompts) with the flag simply ignored
  // — `sks mad-sks --help` took ~22s instead of printing usage. Must exit
  // before any of that work starts.
  if (rawArgsForHelp.includes('--help') || rawArgsForHelp.includes('-h')) {
    const usage = [
      'Usage: sks mad-sks [subcommand] [flags]',
      '',
      `Subcommands: ${MAD_SKS_COMMAND_SURFACE.join(', ')}`,
      '',
      'With no subcommand, launches the MAD-SKS session (zellij UI, dependency checks, scoped permission model).',
      '`sks mad-sks <subcommand> --help` shows this same summary — per-subcommand help is not yet implemented; see docs/mad-db.md and docs/mad-sks*.md for flag reference.'
    ].join('\n');
    if (rawArgsForHelp.includes('--json')) {
      console.log(JSON.stringify({ schema: 'sks.mad-sks-help.v1', ok: true, usage, command_surface: [...MAD_SKS_COMMAND_SURFACE] }, null, 2));
    } else {
      console.log(usage);
    }
    return { schema: 'sks.mad-sks-help.v1', ok: true, usage, command_surface: [...MAD_SKS_COMMAND_SURFACE] };
  }
  const subcommand = firstSubcommand(args);
  if (subcommand) return madSksSubcommand(subcommand, args.filter((arg: any) => String(arg) !== subcommand));

  const rawArgs = (args || []).map((arg: any) => String(arg));
  const glmMadLaunch = isMadGlmLaunch(rawArgs, deps);
  if (!glmMadLaunch) assertNonGlmMadRoute(rawArgs.includes('--mad') ? rawArgs : ['--mad', ...rawArgs]);
  const glmOnlyFlagBlockers = findGlmOnlyMadFlagBlockers(rawArgs, glmMadLaunch);
  if (glmOnlyFlagBlockers.length) {
    const result = {
      ok: false,
      status: 'blocked',
      blockers: glmOnlyFlagBlockers,
      hint: 'GLM profile and diagnostics flags require sks --mad --glm.'
    };
    if (rawArgs.includes('--json')) console.log(JSON.stringify(result, null, 2));
    else {
      console.error('SKS MAD launch blocked: GLM-only flags require --glm.');
      for (const blocker of glmOnlyFlagBlockers) console.error(`- ${blocker}`);
    }
    process.exitCode = 1;
    return result;
  }
  const cleanArgs = stripMadLaunchOnlyArgs(args, { includeGlmFlags: glmMadLaunch });
  const madDbGrant = resolveMadLaunchMadDbGrant(rawArgs);
  const dryRun = rawArgs.includes('--dry-run');
  if (rawArgs.includes('--json') && !dryRun) {
    const profile = glmMadLaunch ? buildMadGlmLaunchProfileNoWrite(rawArgs) : buildMadHighLaunchProfileNoWrite();
    return console.log(JSON.stringify(profile, null, 2));
  }
  const update = { status: 'notice_only', non_blocking: true };
  const headlessZellij = rawArgs.includes('--headless') || process.env.SKS_MAD_ALLOW_HEADLESS === '1';
  const skipZellijRepair = rawArgs.includes('--skip-zellij-repair') || rawArgs.includes('--no-auto-install-zellij');
  const launchRoot = process.cwd();
  if (!(await exists(path.join(launchRoot, '.sneakoscope')))) await initProject(launchRoot, {});
  await cleanupExpiredMadSks(launchRoot);
  if (dryRun) {
    const zellijPlan = skipZellijRepair
      ? { schema: 'sks.zellij-self-heal.v1', ok: true, status: 'skipped', dry_run: true, planned_mutations: [], command: null, blockers: [], warnings: ['zellij_repair_skipped'] }
      : await repairZellijForSks({
          root: launchRoot,
          requestedBy: 'sks --mad',
          fixRequested: true,
          autoApprove: rawArgs.includes('--yes') || rawArgs.includes('-y'),
          interactive: false,
          installHomebrew: rawArgs.includes('--install-homebrew'),
          allowHeadlessFallback: headlessZellij,
          dryRun: true,
          quiet: rawArgs.includes('--json')
        });
    const report = {
      schema: 'sks.mad-sks-zellij-dry-run.v1',
      ok: (zellijPlan as any).ok === true,
      status: (zellijPlan as any).ok === true ? 'dry_run' : 'repair_required',
      generated_at: nowIso(),
      launch_skipped: true,
      zellij_repair: zellijPlan
    };
    await writeJsonAtomic(path.join(launchRoot, '.sneakoscope', 'reports', 'mad-sks-zellij-dry-run.json'), report);
    if (rawArgs.includes('--json')) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`SKS MAD dry-run: launch_skipped=true status=${report.status}`);
      const planned = Array.isArray((zellijPlan as any).planned_mutations) ? (zellijPlan as any).planned_mutations : [];
      for (const row of planned) console.log(`- plan: ${row.command}`);
      if ((zellijPlan as any).command && planned.length === 0) console.log(`- run: ${(zellijPlan as any).command}`);
    }
    return report;
  }
  const codexUpdate: any = { status: 'deferred_background', reason: 'update_prompt_deferred_until_after_mad_ui' };
  if (codexUpdate.status === 'failed' || codexUpdate.status === 'updated_not_reflected') {
    console.error(`Codex CLI update failed: ${codexUpdate.error || 'updated version was not visible on PATH'}`);
    process.exitCode = 1;
    return;
  }
  const zellijUpdate = skipZellijRepair
    ? { status: 'skipped', command: 'sks doctor --fix --yes' }
    : deps.maybePromptZellijUpdateForLaunch
      ? await deps.maybePromptZellijUpdateForLaunch(args, {
          label: glmMadLaunch ? 'GLM MAD launch' : 'MAD launch',
          root: launchRoot,
          selfHealOnMissing: true,
          autoApprove: rawArgs.includes('--yes') || rawArgs.includes('-y'),
          installHomebrew: rawArgs.includes('--install-homebrew'),
          allowHeadlessFallback: headlessZellij
        }).catch(() => ({ status: 'error', command: 'sks doctor --fix --yes' }))
      : await repairZellijForSks({
          root: launchRoot,
          requestedBy: 'sks --mad',
          fixRequested: true,
          autoApprove: rawArgs.includes('--yes') || rawArgs.includes('-y'),
          interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY && process.env.SKS_NO_QUESTION !== '1'),
          installHomebrew: rawArgs.includes('--install-homebrew'),
          allowHeadlessFallback: headlessZellij,
          quiet: rawArgs.includes('--json')
        });
  const zellijRepairBlocked = !headlessZellij && (
    (zellijUpdate as any).status === 'manual_required'
    || (zellijUpdate as any).strategy === 'manual-required'
    || (zellijUpdate as any).ok === false
  );
  if (zellijRepairBlocked) {
    console.error('SKS MAD launch blocked by Zellij repair_required.');
    console.error(`Run: ${(zellijUpdate as any).command || 'sks doctor --fix --yes'}`);
    process.exitCode = 1;
    return { ok: false, status: 'repair_required', command: (zellijUpdate as any).command || 'sks doctor --fix --yes', zellij_repair: zellijUpdate };
  }
  const depStatus = skipZellijRepair && deps.ensureMadLaunchDependencies
    ? await deps.ensureMadLaunchDependencies(args)
    : { ready: true, actions: [] };
  if (!depStatus.ready) {
    console.error('SKS MAD launch blocked by required Zellij dependency.');
    for (const action of depStatus.actions) deps.printDepsInstallAction?.(action);
    process.exitCode = 1;
    return;
  }
  const lb = glmMadLaunch
    ? { status: 'skipped_glm_openrouter', ok: false, reason: 'glm_mad_uses_openrouter_directly' }
    : { status: 'deferred_until_provider_route', ok: true, reason: 'codex_lb_setup_prompt_deferred_until_provider_route' };
  if (!glmMadLaunch && lb.status === 'missing_api_key') {
    process.exitCode = 1;
    return;
  }
  const profile = buildMadHighLaunchProfileNoWrite();
  const uiSnapshotId = Date.now().toString(36);
  const strictUiSnapshot = process.env.SKS_MAD_STRICT_UI_SNAPSHOT === '1';
  const beforeUi = strictUiSnapshot ? await writeCodexAppUiSnapshot(launchRoot, `mad-before-${uiSnapshotId}`).catch(() => null) : null;
  // launchFast skips the redundant live-`codex exec` config probe (up to ~20s, run
  // up to 3x via repair re-inspections): the real codex profile is exercised moments
  // later when the Zellij session opens. All filesystem/permission/EPERM/symlink/ACL
  // readability + repair checks still run. SKS_LAUNCH_FULL_CODEX_PROBE=1 restores the
  // old behavior.
  const allowMadRepair = rawArgs.includes('--repair-config') || rawArgs.includes('--fix') || rawArgs.includes('--yes-repair');
  const launchPreflightOpts = { fix: allowMadRepair, launchFast: process.env.SKS_LAUNCH_FULL_CODEX_PROBE !== '1', profile: profile.profile_name, sandbox: 'danger-full-access', serviceTier: 'fast' };
  let launchPreflight = await runCodexLaunchPreflight(launchRoot, launchPreflightOpts);
  // Fresh-project bootstrap: when the ONLY blocker is that the managed Codex config does
  // not exist yet (`.codex/config.toml` absent), regenerate it — exactly what the blocker
  // action tells the user to run via `sks doctor --fix` — and re-run the preflight once,
  // instead of blocking the launch on a trivially-fixable missing config. An EXISTING but
  // unreadable/broken config is NOT auto-fixed here: it still blocks and routes the user
  // to `sks doctor --fix`, so genuine permission/EPERM/parse problems are never masked.
  if (!launchPreflight.ok && !fs.existsSync(path.join(launchRoot, '.codex', 'config.toml'))) {
    try {
      await initProject(launchRoot, { installScope: rawArgs.includes('--local-only') ? 'project' : 'global', localOnly: rawArgs.includes('--local-only'), globalCommand: 'sks' });
      console.error('SKS MAD bootstrapped the missing managed Codex config (`sks doctor --fix` equivalent) and re-ran preflight.');
      launchPreflight = await runCodexLaunchPreflight(launchRoot, launchPreflightOpts);
    } catch (bootstrapErr: any) {
      console.error(`SKS MAD could not bootstrap the managed Codex config: ${bootstrapErr?.message || bootstrapErr}. Run \`sks doctor --fix\`.`);
    }
  }
  const afterPreflightUi = beforeUi ? await writeCodexAppUiSnapshot(launchRoot, `mad-after-preflight-${uiSnapshotId}`).catch(() => null) : null;
  const preflightUiDiff = beforeUi && afterPreflightUi ? diffCodexAppUiSnapshots(beforeUi, afterPreflightUi) : null;
  if (preflightUiDiff && !preflightUiDiff.ok) {
    await writeJsonAtomic(path.join(launchRoot, '.sneakoscope', 'reports', 'mad-codex-app-ui-preflight-diff.json'), preflightUiDiff);
    console.error('SKS MAD launch changed Codex App UI state during preflight. Run `sks doctor --fix`.');
    process.exitCode = 1;
    return preflightUiDiff;
  }
  if (!launchPreflight.ok) {
    console.error('SKS MAD launch blocked by config preflight.');
    for (const blocker of launchPreflight.blockers || []) console.error(`- blocker: ${blocker}`);
    for (const action of launchPreflight.operator_actions || []) console.error(`- action: ${action}`);
    process.exitCode = 1;
    return launchPreflight;
  }
  const madLaunch = await activateMadZellijPermissionState(process.cwd(), args);
  const glmRuntime: any = glmMadLaunch ? await prepareMadGlmLaunchRuntime(madLaunch, { ...deps, glmArgs: deps?.glmArgs || rawArgs }) : null;
  if (glmMadLaunch && !glmRuntime?.ok) {
    process.exitCode = 1;
    return glmRuntime;
  }
  if (madDbGrant.requested) {
    const grantReport = {
      schema: 'sks.mad-sks-launch-grants.v2',
      generated_at: nowIso(),
      mission_id: madLaunch.mission_id,
      mad_sks_active: true,
      mad_db_active: false,
      mad_db_default_grant: false,
      mad_db_grant_source: madDbGrant.source,
      mad_db_requires_first_class_route: true,
      mad_db_cli: 'sks mad-db run|exec|apply-migration',
      mad_db_capability_file: null,
      standalone_mad_db_enable_still_requires_ack: true
    };
    await writeJsonAtomic(path.join(madLaunch.dir, 'mad-sks-launch-grants.json'), grantReport);
    await appendJsonlBounded(path.join(madLaunch.dir, 'events.jsonl'), { ts: nowIso(), type: 'mad_db.first_class_route_required', grant_source: madDbGrant.source, cli: grantReport.mad_db_cli });
  }
  const updateNotice = {
    schema: 'sks.update-notice.v1',
    checked_at: nowIso(),
    package_name: deps.packageName || 'sneakoscope',
    current_version: deps.packageVersion || PACKAGE_VERSION,
    latest_version: null,
    update_available: false,
    source: 'deferred_background',
    cache_ttl_ms: 0,
    message: 'SKS update notice refresh deferred until after MAD UI launch.'
  };
  void checkSksUpdateNotice({
    packageName: deps.packageName || 'sneakoscope',
    currentVersion: deps.packageVersion || PACKAGE_VERSION,
    missionDir: madLaunch.dir
  }).then((notice: any) => appendJsonlBounded(path.join(madLaunch.dir, 'events.jsonl'), { ts: nowIso(), type: 'mad_sks.update_notice_refreshed_background', non_blocking: true, update_available: notice.update_available === true, source: notice.source })).catch((err: any) => appendJsonlBounded(path.join(madLaunch.dir, 'events.jsonl'), { ts: nowIso(), type: 'mad_sks.update_notice_background_failed', error: err?.message || String(err) }));
  await appendJsonlBounded(path.join(madLaunch.dir, 'events.jsonl'), { ts: nowIso(), type: 'mad_sks.update_notice_checked', non_blocking: true, update_available: updateNotice.update_available === true, source: updateNotice.source });
  console.log(`SKS MAD ready: ${glmRuntime?.profile?.profile_name || madHighProfileName()} | gate ${madLaunch.mission_id}`);
  if (glmRuntime?.profile) console.log(`GLM MAD launch active: ${glmRuntime.profile.model} via OpenRouter; GPT fallback blocked.`);
  if (madDbGrant.requested) console.log('MAD-DB flag observed; deprecated route now redirects to MAD-SKS SQL-plane: sks mad-sks sql|apply-migration.');
  if (updateNotice.update_available === true) console.log(`SKS update notice: ${updateNotice.latest_version} available (non-blocking).`);
  console.log('Scoped high-power maintenance authority active; add explicit --allow-* flags for packages, services, network, browser/Computer Use, generated assets, file permissions, or system/admin scopes. SQL-plane execution is available through MAD-SKS sql-plane and still requires control-plane denial, read-back proof, and read-only restoration.');
  const launchLb = lb.status === 'present' ? { ...lb, status: 'configured' } : lb;
  const zellijVisiblePaneSetting = readOption(cleanArgs, '--zellij-visible-panes', process.env.SKS_ZELLIJ_VISIBLE_PANES || process.env.SKS_ZELLIJ_VISIBLE_PANE_CAP || '8');
  const zellijViewportSetting = readOption(cleanArgs, '--zellij-viewports', process.env.SKS_ZELLIJ_VIEWPORTS || '4');
  const zellijRefreshMsSetting = readOption(cleanArgs, '--zellij-refresh-ms', process.env.SKS_ZELLIJ_REFRESH_MS || '1000');
  const madSksEnv = {
    SKS_PROTECTED_CORE_POLICY: madLaunch.gate.protected_core_policy,
    SKS_MAD_SKS_TARGET_ROOT: madLaunch.gate.cwd,
    SKS_MAD_SKS_PROTECTED_CORE_DIGEST: madLaunch.gate.protected_core_digest,
    SKS_ZELLIJ_VISIBLE_PANES: String(zellijVisiblePaneSetting),
    SKS_ZELLIJ_VIEWPORTS: String(Math.max(0, Math.min(Number(zellijViewportSetting || 4), 6))),
    SKS_ZELLIJ_REFRESH_MS: String(zellijRefreshMsSetting),
  };
  const explicitWorkspace = readOption(cleanArgs, '--workspace', readOption(cleanArgs, '--session', null));
  const launchProfile = glmRuntime?.profile || profile;
  const launchOpts = glmRuntime
    ? buildGlmMadLaunchOpts(cleanArgs, {
        codexArgs: launchProfile.launch_args,
        conciseBlockers: true,
        madSksEnv,
        launchEnv: madSksEnv,
        codexBin: glmRuntime.wrapper.wrapper_path,
        explicitWorkspace
      })
    : codexLbImmediateLaunchOpts(cleanArgs, launchLb, { codexArgs: launchProfile.launch_args, conciseBlockers: true, madSksEnv, launchEnv: madSksEnv });
  // Only the auto-derived stable `sks-mad-<cwd>` name accumulates panes across
  // runs; when the user names a session explicitly (or codex-lb already minted a
  // fresh unique session) respect it and skip the reset.
  const autoDerivedMadSession = !explicitWorkspace && !launchOpts.session;
  const workspace = explicitWorkspace || launchOpts.session || `sks-mad-${sanitizeZellijSessionName(process.cwd())}`;
  const launch: any = headlessZellij
    ? await writeMadHeadlessZellijFallback(madLaunch, workspace)
    : await launchMadZellijUi([...cleanArgs, '--workspace', workspace], { ...launchOpts, missionId: madLaunch.mission_id, root: madLaunch.root, cwd: process.cwd(), ledgerRoot: path.join(madLaunch.dir, 'agents'), slotCount: 0, freshSession: autoDerivedMadSession, requireZellij: process.env.SKS_REQUIRE_ZELLIJ === '1' });
  const afterLaunchUi = beforeUi ? await writeCodexAppUiSnapshot(launchRoot, `mad-after-launch-${uiSnapshotId}`).catch(() => null) : null;
  const launchUiDiff = beforeUi && afterLaunchUi ? diffCodexAppUiSnapshots(beforeUi, afterLaunchUi) : null;
  if (launchUiDiff) {
    await writeJsonAtomic(path.join(madLaunch.dir, 'codex-app-ui-diff.json'), launchUiDiff);
    if (!launchUiDiff.ok) {
      console.error('SKS MAD launch changed Codex App UI state. Run `sks doctor --fix`.');
      process.exitCode = 1;
      return launchUiDiff;
    }
  }
  if (!launch.ok) {
    console.log(`MAD Zellij action: ${formatMadZellijAction(launch)}`);
    return launch;
  }
  await writeJsonAtomic(path.join(madLaunch.dir, 'zellij-initial-ui.json'), {
    schema: 'sks.zellij-initial-ui.v1',
    ok: true,
    mission_id: madLaunch.mission_id,
    session_name: launch.session_name || null,
    live_panes: !headlessZellij,
    initial_panes: 'orchestrator-monitor-viewports',
    dashboard_created: true,
    worker_panes_created: 0,
    viewport_panes_created: Number(madSksEnv.SKS_ZELLIJ_VIEWPORTS),
    ui_architecture: 'monitor_plus_viewports',
    right_column_mode: 'monitor-plus-viewports'
  });
  const madNativeSwarmPromise = startMadNativeSwarm(madLaunch.root, madLaunch, args, launchProfile, {
    env: {
      ...madSksEnv,
      ...(launch.session_name ? { SKS_ZELLIJ_SESSION_NAME: launch.session_name } : {})
    },
    glmLaunch: glmRuntime ? { provider: glmRuntime.profile.provider, model: glmRuntime.profile.model } : null,
    zellijSessionName: launch.session_name || null,
    workerPlacement: headlessZellij ? 'process' : shouldAutoAttachZellij(args) ? 'zellij-pane' : 'process',
    zellijVisiblePaneCap: Number(process.env.SKS_ZELLIJ_VISIBLE_PANE_CAP || zellijVisiblePaneSetting || 8)
  }).catch((err: any) => appendJsonlBounded(path.join(madLaunch.dir, 'events.jsonl'), { ts: nowIso(), type: 'mad_sks.native_swarm_background_failed', error: err?.message || String(err) }));
  void madNativeSwarmPromise;
  // The launcher only creates a detached background session. In an interactive
  // terminal, immediately attach so the session actually opens for the user
  // instead of leaving them to copy/paste the attach command by hand.
  if (!headlessZellij && shouldAutoAttachZellij(args)) {
    console.log(`Opening Zellij session: ${launch.session_name} (detach with Ctrl+q, re-attach later with: ${launch.attach_command_with_env})`);
    const attached = attachZellijSessionInteractive(launch.session_name, { cwd: process.cwd(), configPath: launch.clipboard_config_path });
    if (!attached.ok) {
      console.log(`Could not open the Zellij session automatically${attached.error ? ` (${attached.error})` : ''}.`);
      if (launch.attach_command_with_env) console.log(`Attach with: ${launch.attach_command_with_env}`);
    }
    return launch;
  }
  if (launch.attach_command_with_env) console.log(`Attach with: ${launch.attach_command_with_env}`);
  if (headlessZellij) console.log('MAD launch running headless: live_panes=false.');
  return launch;
}

function isMadGlmLaunch(args: any[] = [], deps: any = {}) {
  const list = (args || []).map((arg: any) => String(arg));
  return list.includes('--glm') || deps?.glmReadiness?.mode === GLM_MAD_MODE;
}

async function prepareMadGlmLaunchRuntime(madLaunch: any, deps: any = {}): Promise<any> {
  const keyResolution = await resolveMadGlmLaunchKey(process.env);
  const profile = buildMadGlmLaunchProfileNoWrite(deps?.glmArgs || []);
  if (profile.blockers.length) {
    const blocked = {
      schema: 'sks.glm-mad-launch.v1',
      ok: false,
      status: 'blocked',
      mission_id: madLaunch.mission_id,
      provider: profile.provider,
      model: profile.model,
      glm_profile: profile.glm_profile,
      glm_mode: profile.glm_mode,
      model_reasoning_effort: profile.model_reasoning_effort,
      gpt_fallback_allowed: false,
      blockers: profile.blockers,
      warnings: []
    };
    await writeJsonAtomic(path.join(madLaunch.dir, 'mad-glm-launch.json'), blocked);
    await appendJsonlBounded(path.join(madLaunch.dir, 'events.jsonl'), {
      ts: nowIso(),
      type: 'mad_sks.glm_launch_blocked',
      blockers: profile.blockers
    });
    console.error(`SKS GLM MAD launch blocked: ${profile.blockers.join(', ')}`);
    return blocked;
  }
  if (!keyResolution.key) {
    const blocked = {
      schema: 'sks.glm-mad-launch.v1',
      ok: false,
      status: 'blocked',
      mission_id: madLaunch.mission_id,
      provider: profile.provider,
      model: profile.model,
      glm_profile: profile.glm_profile,
      glm_mode: profile.glm_mode,
      model_reasoning_effort: profile.model_reasoning_effort,
      gpt_fallback_allowed: false,
      blockers: keyResolution.blockers,
      warnings: keyResolution.warnings
    };
    await writeJsonAtomic(path.join(madLaunch.dir, 'mad-glm-launch.json'), blocked);
    await appendJsonlBounded(path.join(madLaunch.dir, 'events.jsonl'), {
      ts: nowIso(),
      type: 'mad_sks.glm_launch_blocked',
      blockers: keyResolution.blockers
    });
    console.error('SKS GLM MAD launch blocked: OpenRouter API key is missing.');
    console.error('Run: sks --mad --glm --repair');
    return blocked;
  }

  const wrapper = await writeMadGlmCodexWrapper({
    missionDir: madLaunch.dir,
    realCodexBin: process.env.SKS_CODEX_BIN || null
  });
  const report = {
    ...buildMadGlmLaunchArtifact({
      missionId: madLaunch.mission_id,
      keyResolution,
      wrapper,
      profile
    }),
    readiness_status: deps?.glmReadiness?.status || null
  };
  await writeJsonAtomic(path.join(madLaunch.dir, 'mad-glm-launch.json'), report);
  await appendJsonlBounded(path.join(madLaunch.dir, 'events.jsonl'), {
    ts: nowIso(),
    type: 'mad_sks.glm_launch_profile_ready',
    provider: profile.provider,
    model: profile.model,
    glm_profile: profile.glm_profile,
    glm_mode: profile.glm_mode,
    model_reasoning_effort: profile.model_reasoning_effort,
    key_source: keyResolution.source || null,
    gpt_fallback_allowed: false
  });
  return { ok: true, profile, wrapper, report };
}

function buildGlmMadLaunchOpts(cleanArgs: any[] = [], opts: any = {}) {
  if (opts.explicitWorkspace) return opts;
  const root = readOption(cleanArgs, '--root', process.cwd());
  const session = sanitizeZellijSessionName(`sks-glm-${Date.now().toString(36)}-${path.basename(root) || 'project'}`);
  console.log(`Using fresh GLM Zellij session: ${session}`);
  return { ...opts, session, glmMadLaunch: true };
}

export function resolveMadLaunchMadDbGrant(args: any[] = []) {
  const list = (args || []).map((arg: any) => String(arg));
  const requested = list.includes('--mad-db');
  return {
    enabled: false,
    requested,
    source: requested ? 'mad_db_first_class_route_required' : 'not_requested',
    one_cycle_only: true
  };
}

export async function startMadNativeSwarm(root: string, madLaunch: any, args: any[] = [], profile: any = {}, opts: any = {}) {
  const swarm = resolveMadNativeSwarmOptions(args, profile, opts);
  const dir = madLaunch.dir || missionDirLike(root, madLaunch.mission_id);
  const ledgerRoot = path.join(dir, 'agents');
  const artifactPath = path.join(dir, 'mad-sks-native-swarm.json');
  const stdoutLog = path.join(dir, 'mad-sks-native-swarm.stdout.log');
  const stderrLog = path.join(dir, 'mad-sks-native-swarm.stderr.log');
  if (!swarm.enabled) {
    const disabled = {
      schema: 'sks.mad-sks-native-swarm.v1',
      ok: true,
      status: 'disabled',
      reason: swarm.disabled_reason,
      mission_id: madLaunch.mission_id,
      model_provider: opts.glmLaunch?.provider || null,
      model: opts.glmLaunch?.model || null,
      gpt_fallback_allowed: opts.glmLaunch ? false : null,
      lane_count: 1,
      ledger_root: path.relative(root, ledgerRoot)
    };
    await writeJsonAtomic(artifactPath, disabled);
    await appendJsonlBounded(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'mad_sks.native_swarm_disabled', reason: swarm.disabled_reason });
    return disabled;
  }
  const prompt = swarm.prompt || 'MAD-SKS native swarm: inspect the active high-power maintenance session, keep lane cockpit state current, and report risks before writes.';
  const command = [
    process.execPath,
    path.join(packageRoot(), 'dist', 'bin', 'sks.js'),
    'agent',
    'run',
    prompt,
    '--mission',
    madLaunch.mission_id,
    '--route',
    '$MAD-SKS',
    '--agents',
    String(swarm.agents),
    '--target-active-slots',
    String(swarm.agents),
    '--work-items',
    String(swarm.workItems),
    '--minimum-work-items',
    String(swarm.agents),
    '--concurrency',
    String(swarm.agents),
    '--backend',
    swarm.backend,
    '--readonly',
    '--profile',
    profile.profile_name || madHighProfileName(),
    '--service-tier',
    'fast',
    '--fast',
    '--json'
  ];
  if (swarm.backend === 'zellij') {
    command.push('--real');
    command.push('--zellij-session-name', opts.zellijSessionName || `sks-${madLaunch.mission_id}`);
    command.push('--zellij-pane-worker');
    command.push('--worker-placement', opts.workerPlacement || 'zellij-pane');
    command.push('--zellij-visible-pane-cap', String(opts.zellijVisiblePaneCap || swarm.agents));
  }
  const baseReport = {
    schema: 'sks.mad-sks-native-swarm.v1',
    ok: true,
    status: opts.dryRun === true || swarm.dryRun ? 'dry_run' : 'spawned',
    mission_id: madLaunch.mission_id,
    route: '$MAD-SKS',
    route_command: 'sks --mad native swarm',
    same_mission_ledger: true,
    ledger_root: path.relative(root, ledgerRoot),
    lane_count: swarm.agents,
    agents: swarm.agents,
    target_active_slots: swarm.agents,
    work_items: swarm.workItems,
    backend: swarm.backend,
    zellij_session_name: opts.zellijSessionName || null,
    worker_placement: opts.workerPlacement || (swarm.backend === 'zellij' ? 'zellij-pane' : 'process'),
    zellij_visible_pane_cap: opts.zellijVisiblePaneCap || null,
    model_provider: opts.glmLaunch?.provider || null,
    model: opts.glmLaunch?.model || null,
    gpt_fallback_allowed: opts.glmLaunch ? false : null,
    readonly: true,
    command,
    stdout_log: path.relative(root, stdoutLog),
    stderr_log: path.relative(root, stderrLog),
    pid: null as number | null,
    blockers: [] as string[]
  };
  if (baseReport.status === 'spawned') {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const out = fs.openSync(stdoutLog, 'a');
      const err = fs.openSync(stderrLog, 'a');
      const child = spawn(command[0], command.slice(1), {
        cwd: process.cwd(),
        detached: true,
        env: {
          ...process.env,
          ...(opts.env || {}),
          SKS_SKIP_NPM_FRESHNESS_CHECK: '1',
          SKS_MAD_NATIVE_SWARM: '1',
          SKS_PARENT_MAD_MISSION: String(madLaunch.mission_id || '')
        },
        stdio: ['ignore', out, err]
      });
      child.unref();
      fs.closeSync(out);
      fs.closeSync(err);
      baseReport.pid = child.pid || null;
    } catch (err: any) {
      baseReport.ok = false;
      baseReport.status = 'blocked';
      baseReport.blockers = [`mad_native_swarm_spawn_failed:${err?.message || String(err)}`];
    }
  }
  await writeJsonAtomic(artifactPath, baseReport);
  await appendJsonlBounded(path.join(dir, 'events.jsonl'), {
    ts: nowIso(),
    type: baseReport.ok ? 'mad_sks.native_swarm_started' : 'mad_sks.native_swarm_blocked',
    status: baseReport.status,
    agents: swarm.agents,
    backend: swarm.backend,
    pid: baseReport.pid,
    blockers: baseReport.blockers
  });
  return baseReport;
}

export function resolveMadNativeSwarmOptions(args: any[] = [], profile: any = {}, opts: any = {}) {
  const list = (args || []).map((arg: any) => String(arg));
  const operatorDisabled = list.includes('--no-swarm') || list.includes('--no-mad-swarm') || process.env.SKS_MAD_NATIVE_SWARM === '0';
  const glmRequested = list.includes('--glm') || opts.glmLaunch?.provider === 'openrouter';
  const glmNativeSwarmDisabled = glmRequested && process.env.SKS_GLM_MAD_ALLOW_GPT_SWARM !== '1';
  const disabled = operatorDisabled || glmNativeSwarmDisabled;
  const agents = clampInt(readOption(list, '--mad-agents', readOption(list, '--mad-swarm-agents', process.env.SKS_MAD_SWARM_AGENTS || opts.agents || 5)), 1, 20);
  const workItems = clampInt(readOption(list, '--mad-swarm-work-items', process.env.SKS_MAD_SWARM_WORK_ITEMS || opts.workItems || agents), agents, 100);
  const backend = defaultMadSwarmBackend(list, opts);
  return {
    enabled: !disabled,
    disabled_reason: operatorDisabled
      ? 'operator_disabled_mad_native_swarm'
      : glmNativeSwarmDisabled ? 'glm_mad_native_swarm_disabled_to_block_gpt_fallback' : null,
    agents,
    workItems,
    backend,
    dryRun: list.includes('--dry-run') || opts.dryRun === true,
    prompt: String(readOption(list, '--mad-swarm-prompt', opts.prompt || '') || ''),
    profile_name: profile.profile_name || madHighProfileName()
  };
}

function missionDirLike(root: string, missionId: string) {
  return path.join(root, '.sneakoscope', 'missions', missionId);
}

function clampInt(value: unknown, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

// Decide whether to take over the current terminal with a foreground Zellij
// attach. We only do this for genuinely interactive launches; piped, JSON,
// non-TTY, or already-inside-Zellij invocations keep the previous behaviour of
// printing a manual "Attach with:" hint. Use --no-attach (or
// SKS_NO_ZELLIJ_ATTACH=1) to force the background-only behaviour, and --attach
// to force attaching even without a detected TTY.
function shouldAutoAttachZellij(args: any[]): boolean {
  const list = (args || []).map((arg: any) => String(arg));
  if (list.includes('--no-attach')) return false;
  if (list.includes('--json')) return false;
  if (process.env.SKS_NO_ZELLIJ_ATTACH === '1') return false;
  // Nested attach is rejected by Zellij when already inside a session.
  if (process.env.ZELLIJ) return false;
  if (list.includes('--attach')) return true;
  return Boolean(process.stdout.isTTY && process.stdin.isTTY);
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

async function writeMadHeadlessZellijFallback(madLaunch: any, workspace: string) {
  const report = {
    schema: 'sks.zellij-session.v1',
    generated_at: nowIso(),
    ok: true,
    kind: 'mad',
    status: 'headless-fallback',
    live_panes: false,
    mission_id: madLaunch.mission_id,
    session_name: null,
    workspace,
    root: madLaunch.root,
    cwd: path.resolve(process.cwd()),
    attach_command_with_env: null,
    blockers: [],
    warnings: ['zellij_headless_fallback_live_panes_false']
  };
  await writeJsonAtomic(path.join(madLaunch.dir, 'zellij-session.json'), report);
  await appendJsonlBounded(path.join(madLaunch.dir, 'events.jsonl'), { ts: nowIso(), type: 'mad_sks.zellij_headless_fallback', live_panes: false });
  return report;
}

async function activateMadZellijPermissionState(cwd: any = process.cwd(), args: any[] = []) {
  const root = await sksRoot();
  if (!(await exists(path.join(root, '.sneakoscope')))) await initProject(root, {});
  const rawArgs = (args || []).map((arg: any) => String(arg));
  const activatedBy = rawArgs.includes('--glm') ? 'sks --mad --glm' : 'sks --mad';
  const flags = parseMadSksFlags(['--mad-sks', ...args].filter(Boolean));
  const permission = buildMadSksPermissionModel({ targetRoot: cwd, userIntent: `${activatedBy} Zellij scoped high-power maintenance session`, flags });
  const allowedScopes = new Set(permission.allowed_scopes || []);
  const has = (scope: string) => allowedScopes.has(scope as any);
  const dbWriteAllowed = has('db_write');
  const { id, dir } = await createMission(root, { mode: 'mad-sks', prompt: `${activatedBy} Zellij scoped high-power maintenance session` });
  void refreshMadNativeLaunchArtifacts(root, id, dir).catch((err: any) => appendJsonlBounded(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'mad_sks.native_artifact_background_failed', error: err?.message || String(err) }));
  const protectedCore = resolveProtectedCore({ packageRoot: packageRoot(), targetRoot: cwd });
  // The interactive launch 'before' snapshot is only persisted (env + policy json)
  // and is never compared against an 'after' snapshot during the session, so the
  // strong full-content hash is wasted here. Use the cheap metadata digest (no file
  // reads) on the launch hot path. run/apply and the release gates still take their
  // own strong content snapshots where the digest is actually compared.
  const protectedCoreBefore = await snapshotProtectedCore(packageRoot(), 'mad-live-before', { mode: 'metadata' });
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
    sql_plane: {
      requested: false,
      capability_id: null,
      operation_classes: [],
      read_back_passed: false,
      profile_closed: false
    },
    catastrophic_safety_guard_active: true,
    permission_profile: permissionGateSummary(),
    permission_model: permission,
    protected_core_policy: protectedCorePolicyPath,
    protected_core_before: protectedCoreBeforePath,
    protected_core_digest: protectedCoreBefore.digest,
    expires_at: new Date(Date.now() + MAD_SKS_DEFAULT_TTL_MS).toISOString(),
    codex_native_invocation_plan: {
      selected_strategy: 'message-role-fallback',
      hook_evidence_policy: 'background-verification-do-not-count-until-refreshed',
      blockers: [],
      warnings: ['native_invocation_plan_deferred_until_after_ui'],
      artifact_path: 'mad-codex-native-invocation.json'
    },
    activated_by: activatedBy,
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

async function refreshMadNativeLaunchArtifacts(root: string, missionId: string, dir: string) {
  await writeCodex0138CapabilityArtifacts(root, { missionId }).catch(() => null);
  await writeCodex0139CapabilityArtifacts(root, { missionId }).catch(() => null);
  const codexNativeInvocation = await resolveCodexNativeInvocationPlan({
    root,
    missionId,
    route: '$MAD',
    desiredCapability: 'hook-evidence'
  }).catch(() => null);
  if (codexNativeInvocation) await writeJsonAtomic(path.join(dir, 'mad-codex-native-invocation.json'), codexNativeInvocation).catch(() => undefined);
  await appendJsonlBounded(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'mad_sks.native_artifacts_refreshed_background', ok: Boolean(codexNativeInvocation) });
}

function baseMadLaunchOnlyFlags() {
  return new Set([
    '--mad',
    '--MAD',
    '--mad-sks',
    '--glm',
    '--high',
    '--attach',
    '--no-attach',
    '--no-auto-install-zellij',
    '--skip-zellij-repair',
    '--install-homebrew',
    '--headless',
    '--zellij-compact-slots',
    '--zellij-dashboard',
    '--zellij-full-debug',
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
	    '--mad-db',
    '--confirm-delete',
    '--confirm-destructive-delete',
    '--no-swarm',
    '--no-mad-swarm',
    '--mad-agents',
    '--mad-swarm-agents',
    '--mad-swarm-work-items',
    '--mad-swarm-backend',
    '--mad-swarm-prompt',
    '--repair-config',
    '--fix',
    '--yes-repair',
    '--yes',
    '-y',
    '--dry-run',
	    '--plan-only',
	    '--ack'
  ]);
}

function glmMadLaunchOnlyFlags() {
  return new Set([
    '--deep',
    '--xhigh',
    '--strict',
    '--trace',
    '--ttft',
    '--exact-provider'
  ]);
}

function madLaunchOnlyFlags(includeGlmFlags = false) {
  const flags = baseMadLaunchOnlyFlags();
  if (includeGlmFlags) {
    for (const flag of glmMadLaunchOnlyFlags()) flags.add(flag);
  }
  return flags;
}

function madLaunchValueFlags(includeGlmFlags = false) {
  const flags = new Set([
    '--mad-agents',
    '--mad-swarm-agents',
    '--mad-swarm-work-items',
    '--mad-swarm-backend',
	    '--mad-swarm-prompt',
    '--zellij-visible-panes',
    '--zellij-refresh-ms',
	    '--ack'
  ]);
  if (includeGlmFlags) flags.add('--exact-provider');
  return flags;
}

export function findGlmOnlyMadFlagBlockers(args: readonly string[] = [], glmMadLaunch = false): readonly string[] {
  if (glmMadLaunch) return [];
  const blockers: string[] = [];
  const glmOnly = new Set([...glmMadLaunchOnlyFlags(), '--bench']);
  for (const arg of args) {
    if (glmOnly.has(String(arg))) blockers.push(`glm_flag_requires_--glm:${arg}`);
  }
  return blockers;
}

export function defaultMadSwarmBackend(args: any[] = [], opts: any = {}) {
  const list = (args || []).map((arg: any) => String(arg));
  const explicit = readOption(list, '--mad-swarm-backend', null);
  if (explicit) return String(explicit);
  if (process.env.SKS_MAD_SWARM_BACKEND) return String(process.env.SKS_MAD_SWARM_BACKEND);
  if (opts.backend) return String(opts.backend);
  if (list.includes('--json') || list.includes('--no-attach') || opts.nonInteractive === true) return 'codex-sdk';
  if (list.includes('--headless') || process.env.SKS_MAD_ALLOW_HEADLESS === '1') return 'codex-sdk';
  return 'zellij';
}

export function stripMadLaunchOnlyArgs(args: any[] = [], opts: { readonly includeGlmFlags?: boolean } = {}) {
  const flags = madLaunchOnlyFlags(Boolean(opts.includeGlmFlags));
  const valueFlags = madLaunchValueFlags(Boolean(opts.includeGlmFlags));
  const out: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = String(args[i]);
    if (!flags.has(arg)) {
      out.push(arg);
      continue;
    }
    if (valueFlags.has(arg) && args[i + 1] && !String(args[i + 1]).startsWith('--')) i += 1;
  }
  return out;
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
    return { ...opts, session, codexArgs: [...(opts.codexArgs || []), '-c', 'model_provider="openai"'], 'codexLbBypassed': true };
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
  await writeCodex0138CapabilityArtifacts(root, { missionId: id }).catch(() => null);
  await writeCodex0139CapabilityArtifacts(root, { missionId: id }).catch(() => null);
  const gate = {
    schema_version: 1,
    passed: false,
    execution_class: 'mock_fixture',
    mad_sks_permission_active: false,
    permissions_deactivated: false,
    catastrophic_safety_guard_active: true,
    permission_profile: permissionGateSummary(),
    fixture: true,
    blockers: ['mad_sks_fixture_mode_cannot_claim_real']
  };
  await writeJsonAtomic(path.join(dir, 'mad-sks-gate.json'), gate);
  return { mission_id: id, dir, gate };
}

const MAD_SKS_COMMAND_SURFACE = Object.freeze([
  'plan',
  'run',
  'apply',
  'sql',
  'apply-migration',
  'doctor',
  'status',
  'close',
  'revoke',
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
  const sqlPlaneSubcommand = subcommand === 'sql' || subcommand === 'apply-migration';
  // --allow-db-write scope is implied by choosing the sql/apply-migration
  // subcommand itself, but --yes (explicit destructive-action confirmation)
  // must come from the caller's actual args — auto-injecting it here used to
  // silently satisfy guard-middleware's high_risk_confirmation_required check
  // for every sql/apply-migration call regardless of user intent (20차 P0-10).
  const flags = parseMadSksFlags([
    '--mad-sks',
    subcommand === 'plan' ? '--plan-only' : '',
    ...(sqlPlaneSubcommand ? ['--allow-db-write'] : []),
    ...args
  ].filter(Boolean));
  const permission = buildMadSksPermissionModel({ targetRoot, userIntent, flags });
  const root = await sksRoot();
  await cleanupExpiredMadSks(root);

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
      summary: 'MAD-SKS is a user-authorized general permission widening mode and the merged SQL-plane execution route. Target project work can be widened by explicit flags, while SQL-plane work runs through the sql-plane executor with MadDB capability/profile/read-back safeguards and SKS harness/package/dist/scripts/schemas/release metadata remain immutable protected core.',
      command_surface: [...MAD_SKS_COMMAND_SURFACE],
      catastrophic_safeguards: permission.forbidden_scopes,
      immutable_harness_guard: 'installed_harness_only_with_engine_source_exception'
    }, json);
  }

  if (subcommand === 'doctor' || subcommand === 'status') {
    const protectedCore = resolveProtectedCore({ packageRoot: packageRoot(), targetRoot });
    const before = await snapshotProtectedCore(packageRoot(), 'status');
    const statusMissionId = await findLatestMission(root, { mode: 'mad-sks', route: '$MAD-SKS', gateFile: 'mad-sks-gate.json' });
    const gateVerdict = statusMissionId
      ? await evaluateGate(root, statusMissionId, 'mad-sks-gate.json')
      : await evaluateGate(root, 'no-mission', 'mad-sks-gate.json');
    if (!json) console.log(gateVerdict.verdict);
    return emit({
      schema: subcommand === 'doctor' ? 'sks.mad-sks-doctor.v1' : 'sks.mad-sks-status.v1',
      ok: true,
      target_root: targetRoot,
      permission_model: permission,
      protected_core: protectedCore,
      protected_core_snapshot: before,
      protected_core_immutable: !protectedCore.engine_source_exception,
      protected_core_write_allowed: protectedCore.engine_source_exception,
      permission_active: false,
      mission_id: statusMissionId,
      gate_verdict: gateVerdict
    }, json);
  }

  if (subcommand === 'close' || subcommand === 'revoke') {
    return closeMadSks(root, args, json, subcommand);
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

  if (subcommand === 'sql') {
    const sql = readOption(args, '--sql', null) || positionalText(args);
    return materializeMadSksRun(root, targetRoot, permission, sql || userIntent, json, {
      action: 'apply',
      resultSchema: 'sks.mad-sks-sql.v1',
      args,
      executor: 'sql-plane',
      sql,
      verifySql: readOption(args, '--verify-sql', null),
      rollbackSql: readOption(args, '--rollback-sql', null),
      acceptNotRollbackable: args.includes('--accept-not-rollbackable')
    });
  }

  if (subcommand === 'apply-migration') {
    const migrationFile = readOption(args, '--file', null) || args.find((arg: any) => !String(arg).startsWith('--')) || null;
    return materializeMadSksRun(root, targetRoot, permission, userIntent, json, {
      action: 'apply',
      resultSchema: 'sks.mad-sks-apply-migration.v1',
      args,
      executor: 'sql-plane',
      sqlAction: 'apply-migration',
      migrationFile,
      migrationName: readOption(args, '--name', null),
      verifySql: readOption(args, '--verify-sql', null),
      rollbackSql: readOption(args, '--rollback-sql', null),
      acceptNotRollbackable: args.includes('--accept-not-rollbackable')
    });
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
  await writeCodex0138CapabilityArtifacts(root, { missionId: id }).catch(() => null);
  await writeCodex0139CapabilityArtifacts(root, { missionId: id }).catch(() => null);
  const before = await snapshotProtectedCore(packageRoot(), 'before');
  const authorization = opts.authorizationManifest || createMadSksAuthorizationManifest({ permission, userIntent });
  const authorizationPath = opts.authorizationManifestPath || path.join(dir, 'mad-sks-authorization.json');
  if (!opts.authorizationManifestPath) await writeJsonAtomic(authorizationPath, authorization);
  const args = Array.isArray(opts.args) ? opts.args : [];
  const executorId = opts.executor || readOption(args, '--executor', inferMadSksExecutor(args));
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
    yes: args.includes('--yes') || opts.acceptNotRollbackable === true,
    mission_id: id,
    user_intent: userIntent,
    args
  };
  const operation = readOption(args, '--operation', null);
  const command = readOption(args, '--command', null);
  const argv = readRepeatedOption(args, '--argv');
  const sql = opts.sql || readOption(args, '--sql', null);
  const rollbackSql = opts.rollbackSql || readOption(args, '--rollback-sql', null);
  const verifySql = opts.verifySql || readOption(args, '--verify-sql', null);
  const verifyExpectedRowCount = readOption(args, '--expect-row-count', null);
  const verifyExpectedResultDigest = readOption(args, '--expect-result-digest', null);
  const migrationFile = opts.migrationFile || readOption(args, '--migration-file', null) || readOption(args, '--file', null);
  const migrationName = opts.migrationName || readOption(args, '--name', null);
  const sqlAction = opts.sqlAction || null;
  if (operation) executorInput.operation = operation;
  if (command) executorInput.command = command;
  if (argv) executorInput.argv = argv;
  if (sql) executorInput.sql = sql;
  if (rollbackSql) executorInput.rollback_sql = rollbackSql;
  if (verifySql) executorInput.verify_sql = verifySql;
  if (verifyExpectedRowCount !== null) executorInput.verify_expected_row_count = Number(verifyExpectedRowCount);
  if (verifyExpectedResultDigest) executorInput.verify_expected_result_digest = verifyExpectedResultDigest;
  if (migrationFile) executorInput.migration_file = migrationFile;
  if (migrationName) executorInput.migration_name = migrationName;
  if (sqlAction) executorInput.action = sqlAction;
  if (opts.acceptNotRollbackable === true) executorInput.accept_not_rollbackable = true;
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
  const restore = await verifyMadSksPermissionRestored(root, id);
  const sqlPlane = executorResult.sql_plane && typeof executorResult.sql_plane === 'object'
    ? executorResult.sql_plane
    : { requested: false, capability_id: null, operation_classes: [], read_back_passed: false, profile_closed: false };
  const sqlPlaneRequested = (sqlPlane as any).requested === true;
  const sqlPlanePassed = !sqlPlaneRequested || ((sqlPlane as any).read_back_passed === true && (sqlPlane as any).profile_closed === true);
  const gateBlockers = [
    ...(restore.permissions_deactivated === true ? [] : ['permission_restore_failed']),
    ...(comparison.ok === true ? [] : ['protected_core_changed']),
    ...(executorResult.ok === true ? [] : (executorResult.blockers || ['mad_sks_executor_failed'])),
    ...(sqlPlanePassed ? [] : ['mad_sks_sql_plane_read_back_or_profile_close_failed'])
  ];
  const gate = {
    schema_version: 1,
    passed: proof.ok === true && executorResult.ok === true && restore.permissions_deactivated === true && comparison.ok === true && sqlPlanePassed,
    mad_sks_permission_active: false,
    permissions_deactivated: restore.permissions_deactivated === true,
    full_system_authority: permission.mode === 'full_system_authority',
    immutable_harness_guard_passed: comparison.ok === true,
    audit_ledger: auditPath,
    rollback_plan: rollbackPath,
    proof_evidence: proofPath,
    permission_restore_read_back: restore,
    permission_profile: permissionGateSummary(),
    sql_plane: sqlPlane,
    blockers: [...new Set(gateBlockers)]
  };
  await writeJsonAtomic(path.join(dir, 'mad-sks-gate.json'), gate);
  return emit({
    schema: opts.resultSchema || (opts.action === 'apply' ? 'sks.mad-sks-apply.v1' : 'sks.mad-sks-run.v1'),
    ok: gate.passed === true,
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

async function closeMadSks(root: string, args: any[] = [], json = false, action = 'close') {
  const missionId = readOption(args, '--mission', null) || args.find((arg: any) => !String(arg).startsWith('--')) || await findLatestMission(root, { mode: 'mad-sks', route: '$MAD-SKS', gateFile: 'mad-sks-gate.json' });
  if (!missionId) {
    const result = { schema: 'sks.mad-sks-close.v1', ok: false, action, mission_id: null, blockers: ['mad_sks_mission_missing'] };
    process.exitCode = 1;
    return emit(result, json);
  }
  await setCurrent(root, {
    mission_id: missionId,
    route: 'MadSKS',
    route_command: '$MAD-SKS',
    mode: 'MADSKS',
    phase: action === 'revoke' ? 'MADSKS_PERMISSION_REVOKED' : 'MADSKS_PERMISSION_CLOSED',
    mad_sks_active: false,
    mad_sks_modifier: false,
    mad_sks_gate_file: 'mad-sks-gate.json',
    mad_sks_closed_at: nowIso()
  });
  const restore = await verifyMadSksPermissionRestored(root, missionId);
  const result = await writeMadSksCloseGate(root, missionId, action, restore);
  if (!result.ok) process.exitCode = 1;
  return emit(result, json);
}

async function cleanupExpiredMadSks(root: string) {
  const missionId = await findLatestMission(root, { mode: 'mad-sks', route: '$MAD-SKS', gateFile: 'mad-sks-gate.json' });
  if (!missionId) return null;
  const gate = await readJson(path.join(missionDir(root, missionId), 'mad-sks-gate.json'), null);
  const expires = Date.parse(String(gate?.expires_at || ''));
  if (gate?.mad_sks_permission_active !== true || !Number.isFinite(expires) || expires > Date.now()) return gate;
  await setCurrent(root, {
    mission_id: missionId,
    route: 'MadSKS',
    route_command: '$MAD-SKS',
    mode: 'MADSKS',
    phase: 'MADSKS_PERMISSION_EXPIRED_CLOSED',
    mad_sks_active: false,
    mad_sks_modifier: false,
    mad_sks_gate_file: 'mad-sks-gate.json'
  });
  const restore = await verifyMadSksPermissionRestored(root, missionId);
  return writeMadSksCloseGate(root, missionId, 'ttl_expired_lazy_cleanup', restore);
}

async function writeMadSksCloseGate(root: string, missionId: string, action: string, restore: any) {
  const file = path.join(missionDir(root, missionId), 'mad-sks-gate.json');
  const previous = await readJson(file, {});
  const gate = {
    ...previous,
    schema_version: previous.schema_version || 1,
    passed: restore.permissions_deactivated === true,
    mad_sks_permission_active: false,
    permissions_deactivated: restore.permissions_deactivated === true,
    permission_restore_read_back: restore,
    closed_at: nowIso(),
    close_reason: action,
    blockers: restore.permissions_deactivated === true ? [] : ['permission_restore_failed']
  };
  await writeJsonAtomic(file, gate);
  return { schema: 'sks.mad-sks-close.v1', ok: gate.passed === true, action, mission_id: missionId, gate };
}

async function verifyMadSksPermissionRestored(root: string, missionId: string) {
  const state = await readJson(stateFile(root), {});
  const gate = await readJson(path.join(missionDir(root, missionId), 'mad-sks-gate.json'), {});
  const permissionsDeactivated = state.mission_id === missionId
    && state.mad_sks_active !== true
    && gate.mad_sks_permission_active !== true;
  return {
    schema: 'sks.mad-sks-permission-restore-readback.v1',
    checked_at: nowIso(),
    mission_id: missionId,
    permissions_deactivated: permissionsDeactivated,
    state_mad_sks_active: state.mad_sks_active === true,
    gate_mad_sks_permission_active: gate.mad_sks_permission_active === true
  };
}

function inferMadSksExecutor(args: any[] = []) {
  if (readOption(args, '--sql', null)) return 'sql-plane';
  if (readOption(args, '--command', null) || args.includes('--argv')) return 'shell-command';
  if (readOption(args, '--package', null) || args.includes('--allow-package-install')) return 'package-install';
  if (readOption(args, '--service', null) || args.includes('--allow-service-control')) return 'service-control';
  if (args.includes('--allow-computer-use')) return 'computer-use';
  if (args.includes('--allow-browser-use') || args.includes('--allow-browser')) return 'browser-use';
  if (args.includes('--allow-generated-assets')) return 'generated-asset';
  return 'file-write';
}

function positionalText(args: any[] = []) {
  const valueFlags = new Set([
    '--sql',
    '--verify-sql',
    '--expect-row-count',
    '--expect-result-digest',
    '--rollback-sql',
    '--target-root',
    '--intent',
    '--executor',
    '--cwd',
    '--name',
    '--file',
    '--migration-file'
  ]);
  const out: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = String(args[index] || '');
    if (!arg || arg === '--json' || arg === '--yes' || arg === '-y' || arg === '--accept-not-rollbackable') continue;
    if (valueFlags.has(arg)) {
      index += 1;
      continue;
    }
    if (arg.startsWith('--')) continue;
    out.push(arg);
  }
  return out.join(' ').trim();
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
