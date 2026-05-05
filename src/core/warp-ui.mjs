import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { exists, nowIso, packageRoot, readJson, runProcess, sha256, sksRoot, which, writeJsonAtomic } from './fsx.mjs';
import { getCodexInfo } from './codex-adapter.mjs';
import { codexAppIntegrationStatus, formatCodexAppStatus } from './codex-app.mjs';

export const SKS_WARP_LOGO = [
  '   _____ __ __ _____',
  '  / ___// //_// ___/',
  '  \\__ \\/ ,<   \\__ \\   ㅅㅋㅅ',
  ' ___/ / /| | ___/ /',
  '/____/_/ |_|/____/',
  'Sneakoscope Codex Warp'
].join('\n');

export function sanitizeWarpWorkspaceName(input) {
  const base = String(input || 'sks').trim().replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '');
  return (base || 'sks').slice(0, 80);
}

export function defaultWarpWorkspaceName(root) {
  const base = sanitizeWarpWorkspaceName(path.basename(root || process.cwd()) || 'project');
  const hash = sha256(path.resolve(root || process.cwd())).slice(0, 8);
  return sanitizeWarpWorkspaceName(`sks-${base}-${hash}`);
}

export function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export function platformWarpInstallHint() {
  if (process.platform === 'darwin') return 'Install Warp from https://www.warp.dev/download or run: brew install --cask warp';
  return 'Install Warp from https://www.warp.dev/download, then run: sks warp check';
}

export function warpLaunchConfigurationsDir() {
  if (process.env.SKS_WARP_LAUNCH_CONFIG_DIR) return path.resolve(process.env.SKS_WARP_LAUNCH_CONFIG_DIR);
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'warp', 'Warp', 'data', 'launch_configurations');
  if (process.platform === 'linux') return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'warp-terminal', 'launch_configurations');
  return path.join(os.homedir(), '.warp', 'launch_configurations');
}

export function warpStatePath(root = process.cwd()) {
  return path.join(path.resolve(root || process.cwd()), '.sneakoscope', 'state', 'warp-launches.json');
}

export function warpTeamStatePath(root = process.cwd()) {
  return path.join(path.resolve(root || process.cwd()), '.sneakoscope', 'state', 'warp-team-launches.json');
}

export function warpLaunchConfigFilename(plan = {}) {
  const workspace = sanitizeWarpWorkspaceName(plan.workspace || defaultWarpWorkspaceName(plan.root));
  return `${workspace}.yaml`;
}

export function warpLaunchConfigPath(plan = {}) {
  return path.join(warpLaunchConfigurationsDir(), warpLaunchConfigFilename(plan));
}

export function warpLaunchUri(configPathOrFilename) {
  const filename = path.basename(String(configPathOrFilename || ''));
  return `warp://launch/${encodeURIComponent(filename)}`;
}

export function isWarpShellSession(env = process.env) {
  if (truthyEnv(env.WARP_IS_LOCAL_SHELL_SESSION)) return true;
  if (truthyEnv(env.WARP_SESSION_ID)) return true;
  return String(env.TERM_PROGRAM || '') === 'WarpTerminal';
}

export function warpOpenLaunchDecision(opts = {}) {
  const args = Array.isArray(opts.args) ? opts.args : [];
  const env = opts.env || process.env;
  if (opts.forceOpen === true || opts.open === true || args.includes('--open') || args.includes('--force-open') || truthyEnv(env.SKS_WARP_FORCE_OPEN) || truthyEnv(env.SKS_WARP_OPEN)) {
    return { open: true, reason: 'forced' };
  }
  if (opts.skipOpen === true || opts.noOpen === true || opts.open === false || args.includes('--no-open') || truthyEnv(env.SKS_WARP_SKIP_OPEN) || truthyEnv(env.SKS_WARP_NO_OPEN)) {
    return { open: false, reason: 'opening disabled by option/env' };
  }
  if (isWarpShellSession(env)) {
    return { open: false, current_session: true, reason: 'already inside Warp shell session' };
  }
  return { open: true, reason: 'default' };
}

function truthyEnv(value) {
  return value !== undefined && value !== null && !/^(?:0|false|no|off)$/i.test(String(value).trim());
}

export async function findWarpApp() {
  const env = process.env.SKS_WARP_APP || process.env.WARP_APP;
  if (env && await exists(env)) return env;
  if (process.platform !== 'darwin') return null;
  for (const candidate of [
    '/Applications/Warp.app',
    path.join(os.homedir(), 'Applications', 'Warp.app')
  ]) {
    if (await exists(candidate)) return candidate;
  }
  return null;
}

export async function findWarpCli() {
  return await which('warp').catch(() => null) || await which('oz').catch(() => null);
}

export async function warpReadiness(opts = {}) {
  const app = opts.app ?? await findWarpApp();
  const cli = opts.cli ?? await findWarpCli();
  const launch_config_dir = warpLaunchConfigurationsDir();
  const appOk = process.platform === 'darwin' ? Boolean(app) : Boolean(cli || app);
  return {
    ok: appOk,
    app: app || null,
    cli: cli || null,
    version: app ? 'Warp.app' : cli ? path.basename(cli) : null,
    launch_config_dir,
    uri_scheme: 'warp://launch/<launch_configuration_name>',
    error: appOk ? null : 'Warp app not found'
  };
}

export function warpStatusKind(warp = {}) {
  return warp.ok ? 'ok' : 'missing';
}

export function codexLaunchCommand(root, codexBin, codexArgs = []) {
  const extraArgs = Array.isArray(codexArgs) ? codexArgs : [];
  return [
    'clear',
    `printf '%s\\n' ${shellEscape(SKS_WARP_LOGO)}`,
    `printf '\\nProject: %s\\n' ${shellEscape(root)}`,
    'printf \'Runtime: Warp Launch Configuration for Codex CLI\\n\'',
    'printf \'Prompt:  use canonical $ commands, for example $Team or $QA-LOOP\\n\\n\'',
    'sleep 1',
    `exec ${[shellEscape(codexBin), ...extraArgs.map(shellEscape), '--cd', shellEscape(root)].join(' ')}`
  ].join('; ');
}

function terminalTitleCommand(title = '') {
  return `printf '\\033]0;%s\\007' ${shellEscape(String(title || '').slice(0, 80))}`;
}

function ansiColorCode(color = '') {
  return {
    blue: '34',
    cyan: '36',
    yellow: '33',
    green: '32',
    red: '31',
    magenta: '35'
  }[String(color || '').toLowerCase()] || '37';
}

function colorizedLaneBannerCommand(lines = [], color = '') {
  const code = ansiColorCode(color);
  const text = lines.join('\n');
  return `printf '\\033[1;${code}m%s\\033[0m\\n' ${shellEscape(text)}`;
}

export const WARP_TEAM_LANE_STYLES = Object.freeze({
  overview: Object.freeze({ role: 'overview', label: 'overview', color_name: 'Blue', color: 'blue', icon: 'layout-dashboard' }),
  scout: Object.freeze({ role: 'scout', label: 'scout', color_name: 'Cyan', color: 'cyan', icon: 'search' }),
  planning: Object.freeze({ role: 'planning', label: 'plan', color_name: 'Yellow', color: 'yellow', icon: 'messages-square' }),
  execution: Object.freeze({ role: 'execution', label: 'exec', color_name: 'Green', color: 'green', icon: 'hammer' }),
  review: Object.freeze({ role: 'review', label: 'review', color_name: 'Red', color: 'red', icon: 'shield-check' }),
  safety: Object.freeze({ role: 'safety', label: 'safety', color_name: 'Magenta', color: 'magenta', icon: 'database' })
});

export function teamLaneStyle(agentId = '') {
  const id = String(agentId || '').toLowerCase();
  if (!id || id === 'mission_overview' || id === 'overview') return WARP_TEAM_LANE_STYLES.overview;
  if (/analysis|scout/.test(id)) return WARP_TEAM_LANE_STYLES.scout;
  if (/debate|consensus|planner|user/.test(id)) return WARP_TEAM_LANE_STYLES.planning;
  if (/db|safety/.test(id)) return WARP_TEAM_LANE_STYLES.safety;
  if (/review|qa|validation/.test(id)) return WARP_TEAM_LANE_STYLES.review;
  if (/executor|implementation|worker|developer/.test(id)) return WARP_TEAM_LANE_STYLES.execution;
  return WARP_TEAM_LANE_STYLES.planning;
}

function teamLaneTitle(agentId = '') {
  const style = teamLaneStyle(agentId);
  return `${style.label}: ${String(agentId || 'mission_overview')}`.slice(0, 80);
}

export function teamAgentCommand(root, missionId, agentId, phase) {
  const style = teamLaneStyle(agentId);
  const title = teamLaneTitle(agentId);
  return [
    terminalTitleCommand(title),
    'clear',
    colorizedLaneBannerCommand([...SKS_WARP_LOGO.split('\n'), '', `Team mission: ${missionId}`, `Agent: ${agentId}`, `Lane: ${style.label} (${style.color_name})`, `Phase: ${phase}`, 'Messages: sks team message ... --to ' + agentId, 'Cleanup: sks team cleanup-warp ' + missionId], style.color),
    `cd ${shellEscape(root)}`,
    `node ${shellEscape(path.join(packageRoot(), 'bin', 'sks.mjs'))} team lane ${shellEscape(missionId)} --agent ${shellEscape(agentId)} --phase ${shellEscape(phase)} --follow --lines 12`
  ].join('; ');
}

export function teamOverviewCommand(root, missionId) {
  const style = teamLaneStyle('mission_overview');
  const title = teamLaneTitle('mission_overview');
  return [
    terminalTitleCommand(title),
    'clear',
    colorizedLaneBannerCommand([...SKS_WARP_LOGO.split('\n'), '', `Team mission: ${missionId}`, 'View: live orchestration overview', `Lane: ${style.label} (${style.color_name})`, 'Messages: sks team message ... --to <agent|all>', 'Cleanup: sks team cleanup-warp ' + missionId], style.color),
    `cd ${shellEscape(root)}`,
    `node ${shellEscape(path.join(packageRoot(), 'bin', 'sks.mjs'))} team watch ${shellEscape(missionId)} --follow --lines 18`
  ].join('; ');
}

export async function buildWarpLaunchPlan(opts = {}) {
  const root = path.resolve(opts.root || await sksRoot());
  const workspace = sanitizeWarpWorkspaceName(opts.workspace || opts.session || defaultWarpWorkspaceName(root));
  const sksBin = opts.sksBin || path.join(packageRoot(), 'bin', 'sks.mjs');
  const codex = opts.codex || await getCodexInfo().catch(() => ({}));
  const warp = opts.warp || await warpReadiness();
  const app = opts.app || await codexAppIntegrationStatus({ codex });
  const codexArgs = Array.isArray(opts.codexArgs) ? opts.codexArgs : [];
  const config_path = warpLaunchConfigPath({ root, workspace });
  return {
    root,
    workspace,
    sksBin,
    codex,
    warp,
    app,
    codexArgs,
    config_path,
    launch_uri: warpLaunchUri(config_path),
    ready: Boolean(warp.ok && codex.bin),
    warnings: app.ok ? [] : app.guidance || [],
    blockers: [
      ...(!warp.ok ? [`Warp missing. ${platformWarpInstallHint()}`] : []),
      ...(!codex.bin ? ['Codex CLI missing. Install: npm i -g @openai/codex, or set SKS_CODEX_BIN.'] : [])
    ]
  };
}

export function formatWarpBanner(status = null) {
  const lines = [
    SKS_WARP_LOGO,
    '',
    'ㅅㅋㅅ Warp runtime',
    '',
    'Canonical prompt commands:',
    '  $DFix  $Answer  $SKS  $Team  $QA-LOOP  $Goal  $Research  $AutoResearch  $DB  $GX  $Wiki  $Help',
    '',
    'CLI-first runtime:',
    '  sks warp open       explicitly open a Warp Codex CLI launch configuration',
    '  sks --mad           open one-shot MAD full-access auto-review launch configuration',
    '  sks team "task"     prepare Team mission and Warp split-pane live view',
    '',
    'Useful terminal commands:',
    '  sks commands',
    '  sks dollar-commands',
    '  sks codex-app check',
    '  sks doctor --fix'
  ];
  if (status) lines.push('', formatCodexAppStatus(status));
  return lines.join('\n');
}

export function buildWarpLaunchConfigYaml(plan = {}, panes = []) {
  const title = String(plan.title || plan.workspace || defaultWarpWorkspaceName(plan.root)).slice(0, 80);
  const normalizedPanes = panes.length ? panes : [{ cwd: plan.root, command: plan.command || codexLaunchCommand(plan.root, plan.codex?.bin || 'codex', plan.codexArgs), focused: true }];
  const layout = paneLayoutYaml(normalizedPanes, 14);
  return [
    '# Warp Launch Configuration',
    '# Generated by Sneakoscope Codex. Warp loads this from its launch_configurations directory.',
    '---',
    `name: ${yamlQuote(title)}`,
    'active_window_index: 0',
    'windows:',
    '  - active_tab_index: 0',
    '    tabs:',
    `      - title: ${yamlQuote(title)}`,
    `        color: ${yamlQuote(plan.color || 'blue')}`,
    '        layout:',
    layout
  ].join('\n') + '\n';
}

function paneLayoutYaml(panes = [], indent = 0) {
  if (panes.length <= 1) return leafPaneYaml(panes[0] || {}, indent);
  const [first, ...rest] = panes;
  const lines = [
    `${space(indent)}split_direction: vertical`,
    `${space(indent)}panes:`,
    ...leafPaneYaml(first, indent + 2, true),
    ...(rest.length === 1
      ? leafPaneYaml(rest[0], indent + 2, true)
      : [
          `${space(indent + 2)}- split_direction: horizontal`,
          `${space(indent + 4)}panes:`,
          ...rest.flatMap((pane) => leafPaneYaml(pane, indent + 6, true))
        ])
  ];
  return lines.join('\n');
}

function leafPaneYaml(pane = {}, indent = 0, listItem = false) {
  const prefix = listItem ? `${space(indent)}- ` : space(indent);
  const cont = space(indent + (listItem ? 2 : 0));
  const lines = [
    `${prefix}cwd: ${yamlQuote(path.resolve(pane.cwd || pane.directory || process.cwd()))}`,
    `${cont}commands:`,
    `${cont}  - exec: ${yamlQuote(pane.command || 'pwd')}`
  ];
  if (pane.focused || pane.is_focused) lines.push(`${cont}is_focused: true`);
  return listItem ? lines : lines.join('\n');
}

function yamlQuote(value) {
  return JSON.stringify(String(value ?? ''));
}

function space(n) {
  return ' '.repeat(n);
}

export async function writeWarpLaunchConfig(plan = {}, panes = []) {
  const configPath = warpLaunchConfigPath(plan);
  await fsp.mkdir(path.dirname(configPath), { recursive: true });
  const yaml = buildWarpLaunchConfigYaml(plan, panes);
  await fsp.writeFile(configPath, yaml, 'utf8');
  const record = {
    schema_version: 1,
    workspace: plan.workspace,
    root: path.resolve(plan.root || process.cwd()),
    config_path: configPath,
    launch_uri: warpLaunchUri(configPath),
    updated_at: nowIso()
  };
  const statePath = warpStatePath(plan.root);
  const state = await readJson(statePath, {}).catch(() => ({}));
  await writeJsonAtomic(statePath, {
    schema_version: 1,
    updated_at: record.updated_at,
    launches: { ...(state.launches && typeof state.launches === 'object' ? state.launches : {}), [record.workspace]: record }
  }).catch(() => null);
  return { config_path: configPath, yaml, record };
}

export async function openWarpLaunchConfig(configPath, opts = {}) {
  const uri = warpLaunchUri(configPath);
  const decision = warpOpenLaunchDecision(opts);
  if (!decision.open) return { ok: false, skipped: true, reason: decision.reason, uri, stdout: '', stderr: '' };
  if (process.platform === 'darwin') {
    const run = await runProcess('open', [uri], { timeoutMs: 5000, maxOutputBytes: 16 * 1024 }).catch((err) => ({ code: 1, stderr: err.message, stdout: '' }));
    return { ok: run.code === 0, skipped: false, reason: decision.reason, uri, stdout: run.stdout || '', stderr: run.stderr || '' };
  }
  const opener = await which('xdg-open').catch(() => null);
  if (opener) {
    const run = await runProcess(opener, [uri], { timeoutMs: 5000, maxOutputBytes: 16 * 1024 }).catch((err) => ({ code: 1, stderr: err.message, stdout: '' }));
    return { ok: run.code === 0, skipped: false, reason: decision.reason, uri, stdout: run.stdout || '', stderr: run.stderr || '' };
  }
  return { ok: false, skipped: false, reason: decision.reason, uri, stdout: '', stderr: 'No platform URI opener found' };
}

export async function launchWarpUi(args = [], opts = {}) {
  const rootArg = readOption(args, '--root', opts.root);
  const workspaceArg = readOption(args, '--workspace', readOption(args, '--session', opts.workspace || opts.session));
  const plan = await buildWarpLaunchPlan({ ...opts, root: rootArg, workspace: workspaceArg });
  if (args.includes('--json')) return { plan };
  if (!plan.ready && !args.includes('--status-only')) {
    printWarpLaunchBlocked(plan, { concise: opts.conciseBlockers });
    process.exitCode = 1;
    return { plan };
  }
  if (args.includes('--status-only')) return { plan };
  const command = codexLaunchCommand(plan.root, plan.codex.bin, plan.codexArgs);
  const written = await writeWarpLaunchConfig({ ...plan, command }, [{ cwd: plan.root, command, focused: true }]);
  const decision = warpOpenLaunchDecision({ ...opts, args });
  const opened = decision.current_session
    ? runWarpCommandInCurrentSession(command, { cwd: plan.root, dryRun: opts.dryRunCurrentSession || opts.dryRun })
    : await openWarpLaunchConfig(written.config_path, { ...opts, args });
  if (!args.includes('--quiet')) {
    console.log(`SKS Warp launch configuration: ${written.config_path}`);
    console.log(`Warp URI: ${written.record.launch_uri}`);
    if (opened.current_session) console.log(`Warp: current session (${opened.reason || 'already inside Warp shell session'})`);
    else if (opened.ok) console.log('Warp: opened');
    else if (opened.skipped) console.log(`Warp: skipped (${opened.reason || 'opening disabled'})`);
    else if (!opened.skipped) console.log(`Warp: not opened (${opened.stderr || 'URI opener failed'})`);
  }
  return { plan, created: true, config_path: written.config_path, launch_uri: written.record.launch_uri, opened };
}

function runWarpCommandInCurrentSession(command, opts = {}) {
  if (opts.dryRun) return { ok: true, current_session: true, skipped: false, reason: 'dry run current Warp session', command };
  const shell = process.env.SHELL || '/bin/sh';
  const run = spawnSync(shell, ['-lc', command], {
    cwd: opts.cwd || process.cwd(),
    stdio: 'inherit',
    env: process.env
  });
  return {
    ok: run.status === 0,
    current_session: true,
    skipped: false,
    reason: 'ran in current Warp shell session',
    code: run.status,
    signal: run.signal || null,
    stderr: run.error?.message || ''
  };
}

function printWarpLaunchBlocked(plan, opts = {}) {
  if (opts.concise) {
    console.error('SKS Warp launch blocked.');
    if (!plan.warp.ok) console.error(`- Warp missing: ${platformWarpInstallHint()}`);
    if (!plan.codex.bin) console.error('- Codex CLI missing. Install: npm i -g @openai/codex@latest, or set SKS_CODEX_BIN.');
    return;
  }
  console.log(formatWarpBanner(plan.app));
  console.log('\nLaunch blocked:\n');
  for (const blocker of Array.from(new Set(plan.blockers))) console.log(`- ${blocker}`);
}

export async function launchWarpTeamView({ root, missionId, plan = {}, promptFile = null, json = false } = {}) {
  const launch = await buildWarpLaunchPlan({ root, workspace: `sks-team-${missionId}` });
  const agents = [
    ...(plan.roster?.analysis_team || []),
    ...(plan.roster?.debate_team || []),
    ...(plan.roster?.development_team || []),
    ...(plan.roster?.validation_team || [])
  ];
  const uniqueAgents = [];
  const seen = new Set();
  for (const agent of agents) {
    const id = agent.id || String(agent);
    if (seen.has(id)) continue;
    seen.add(id);
    uniqueAgents.push(id);
  }
  const commands = uniqueAgents.slice(0, Math.max(1, plan.agent_session_count || 3)).map((agentId, index) => ({
    agent: agentId,
    command: teamAgentCommand(launch.root, missionId, agentId, index === 0 ? 'analysis' : 'team', promptFile),
    style: teamLaneStyle(agentId),
    title: teamLaneTitle(agentId)
  }));
  const overview = { agent: 'mission_overview', role: 'overview', command: teamOverviewCommand(launch.root, missionId), style: teamLaneStyle('mission_overview'), title: teamLaneTitle('mission_overview') };
  const lanes = [overview, ...commands.map((entry) => ({ ...entry, role: entry.style.role }))];
  const result = {
    ready: launch.ready,
    warp: launch.warp,
    workspace: launch.workspace,
    overview,
    agents: commands,
    lanes,
    cleanup_policy: 'mark-complete; Warp live panes remain user controlled',
    blockers: launch.blockers,
    config_path: launch.config_path,
    launch_uri: launch.launch_uri
  };
  if (json || !launch.ready) return result;
  const panes = lanes.map((lane, index) => ({ cwd: launch.root, command: lane.command, focused: index === 0 }));
  const written = await writeWarpLaunchConfig({ ...launch, color: overview.style.color }, panes);
  const opened = await openWarpLaunchConfig(written.config_path);
  result.created = true;
  result.opened = opened;
  result.config_path = written.config_path;
  result.launch_uri = written.record.launch_uri;
  result.opened_lane_count = lanes.length;
  result.all_lanes_opened = Boolean(opened.ok);
  result.ready = Boolean(result.ready && written.config_path);
  await writeWarpTeamRecord(launch.root, {
    mission_id: missionId,
    workspace: launch.workspace,
    config_path: written.config_path,
    launch_uri: written.record.launch_uri,
    cleanup_policy: result.cleanup_policy,
    lanes: lanes.map((entry) => ({
      agent: entry.agent,
      role: entry.style?.role || teamLaneStyle(entry.agent).role,
      style: entry.style || teamLaneStyle(entry.agent),
      title: entry.title || teamLaneTitle(entry.agent)
    }))
  }).catch(() => null);
  return result;
}

async function writeWarpTeamRecord(root, record = {}) {
  if (!record.mission_id || !record.config_path) return null;
  const statePath = warpTeamStatePath(root);
  const state = await readJson(statePath, {}).catch(() => ({}));
  const now = nowIso();
  const nextRecord = { ...record, schema_version: 1, root: path.resolve(root || process.cwd()), updated_at: now };
  const missions = state.missions && typeof state.missions === 'object' ? state.missions : {};
  await writeJsonAtomic(statePath, {
    schema_version: 1,
    updated_at: now,
    missions: { ...missions, [record.mission_id]: nextRecord }
  });
  return nextRecord;
}

async function readWarpTeamRecord(root, missionId) {
  const state = await readJson(warpTeamStatePath(root), {}).catch(() => ({}));
  const missions = state.missions && typeof state.missions === 'object' ? state.missions : {};
  if (missionId && missionId !== 'latest') return missions[missionId] || null;
  const records = Object.values(missions).filter((entry) => entry && typeof entry === 'object');
  records.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  return records[0] || null;
}

export async function cleanupWarpTeamView({ root, missionId = 'latest', closeWorkspace = false } = {}) {
  const resolvedRoot = path.resolve(root || await sksRoot());
  const record = await readWarpTeamRecord(resolvedRoot, missionId);
  if (!record?.config_path) return { ok: false, skipped: true, reason: 'no recorded Warp Team launch configuration', mission_id: missionId };
  let removed_config = false;
  if (closeWorkspace || closeWorkspace === true) {
    await fsp.rm(record.config_path, { force: true }).catch(() => null);
    removed_config = true;
  }
  await writeWarpTeamRecord(resolvedRoot, { ...record, cleanup_completed_at: nowIso(), removed_config }).catch(() => null);
  return {
    ok: true,
    mission_id: record.mission_id,
    config_path: record.config_path,
    launch_uri: record.launch_uri,
    close_workspace: false,
    removed_config,
    requested_close_surfaces: 0,
    closed_surfaces: 0,
    reason: 'Warp public URI/Launch Configuration surface does not expose live pane close/select controls; cleanup marks the SKS launch record complete.'
  };
}

export async function runWarpStatus(args = [], opts = {}) {
  const once = args.includes('--once') || !args.includes('--watch');
  do {
    const app = await codexAppIntegrationStatus();
    console.clear();
    console.log(formatWarpBanner(app));
    if (once) return app;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  } while (true);
}

export function buildWarpOpenArgs(plan = {}) {
  return ['open', warpLaunchUri(warpLaunchConfigPath(plan))];
}

export function runWarpLaunchConfigSyntaxCheck(yaml = '') {
  const text = String(yaml || '');
  return {
    ok: /^---\n/m.test(text) && /\nwindows:\n/.test(text) && /\n\s+commands:\n\s+- exec:/.test(text),
    has_split_panes: /\nsplit_direction:\s*(vertical|horizontal)/.test(text),
    has_cwd: /\ncwd:\s*"/.test(text)
  };
}

function readOption(args, name, fallback = null) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
