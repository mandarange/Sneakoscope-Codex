import path from 'node:path';
import { appendJsonlBounded, exists, nowIso, readJson, sksRoot, writeJsonAtomic } from '../fsx.mjs';
import { initProject } from '../init.mjs';
import { createMission, setCurrent } from '../mission.mjs';
import { enableMadHighProfile, madHighProfileName } from '../auto-review.mjs';
import { permissionGateSummary } from '../permission-gates.mjs';
import { defaultTmuxSessionName, launchMadTmuxUi, sanitizeTmuxSessionName } from '../tmux-ui.mjs';

export async function madHighCommand(args = [], deps = {}) {
  const cleanArgs = args.filter((arg) => !['--mad', '--MAD', '--mad-sks', '--high', '--no-auto-install-tmux'].includes(arg));
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

async function activateMadTmuxPermissionState(cwd = process.cwd()) {
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

function readOption(args, name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

function codexLbImmediateLaunchOpts(args = [], lb = {}, opts = {}) {
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
  if (!codexArgs.some((arg) => /model_provider\s*=/.test(String(arg || '')))) codexArgs.push('-c', 'model_provider="codex-lb"');
  if (explicitSession) return { ...opts, codexArgs };
  const session = sanitizeTmuxSessionName(`sks-codex-lb-${Date.now().toString(36)}-${defaultTmuxSessionName(root)}`);
  console.log(`codex-lb active for this launch: ${lb.env_path || lb.base_url || 'configured'}`);
  console.log(`Using fresh tmux session: ${session}`);
  return { ...opts, codexArgs, session, codexLbFreshSession: true };
}

export async function madSksFixture(root) {
  const { id, dir } = await createMission(root, { mode: 'mad-sks', prompt: '$MAD-SKS fixture permission gate' });
  const gate = { schema_version: 1, passed: true, mad_sks_permission_active: true, permissions_deactivated: true, catastrophic_safety_guard_active: true, permission_profile: permissionGateSummary(), fixture: true };
  await writeJsonAtomic(path.join(dir, 'mad-sks-gate.json'), gate);
  return { mission_id: id, dir, gate };
}
