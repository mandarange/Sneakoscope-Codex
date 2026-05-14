import path from 'node:path';
import fsp from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import figlet from 'figlet';
import { exists, nowIso, PACKAGE_VERSION, packageRoot, readJson, runProcess, sha256, sksRoot, which, writeJsonAtomic } from './fsx.mjs';
import { getCodexInfo } from './codex-adapter.mjs';
import { codexAppIntegrationStatus, formatCodexAppStatus } from './codex-app.mjs';
import { REQUIRED_CODEX_MODEL, forceGpt55CodexArgs } from './codex-model-guard.mjs';
import { MIN_TEAM_REVIEWER_LANES } from './team-review-policy.mjs';
import { appendTeamEvent, readTeamControl, readTeamDashboard, teamCleanupRequested } from './team-live.mjs';

const SKS_FIGLET_FONT = 'Standard';

function trimFiglet(text = '') {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+$/g, ''))
    .join('\n')
    .replace(/\n+$/g, '');
}

export function sksAsciiLogo(opts = {}) {
  const version = opts.version || PACKAGE_VERSION;
  const subtitle = opts.subtitle || 'SNEAKOSCOPE CODEX';
  let logo = '';
  try {
    logo = figlet.textSync('SKS', {
      font: SKS_FIGLET_FONT,
      horizontalLayout: 'fitted',
      verticalLayout: 'default'
    });
  } catch {
    logo = '  ____   _  __ ____\n / ___| | |/ // ___|\n \\___ \\ | \' / \\___ \\\n  ___) || . \\  ___) |\n |____/ |_|\\_\\|____/';
  }
  return `${trimFiglet(logo)}\n${subtitle} v${version}`;
}

export const SKS_TMUX_LOGO = sksAsciiLogo();

const SKS_TMUX_LOGO_FRAMES = [
  SKS_TMUX_LOGO
];

const SKS_TMUX_LOGO_ANIMATION_STEPS = Object.freeze([
  { frame: 0, color: '51', bold: true, delay: '0.16' }
]);

export const DEFAULT_SKS_CODEX_MODEL = REQUIRED_CODEX_MODEL;
export const DEFAULT_SKS_CODEX_REASONING = 'high';

export function defaultCodexLaunchArgs(env = process.env) {
  const model = DEFAULT_SKS_CODEX_MODEL;
  const effort = String(env.SKS_CODEX_REASONING || DEFAULT_SKS_CODEX_REASONING).trim();
  const args = [];
  if (model) args.push('--model', model);
  args.push('-c', 'service_tier="fast"');
  if (effort) args.push('-c', `model_reasoning_effort="${effort}"`);
  return args;
}

function codexArgsWithFastServiceTier(args = []) {
  const input = Array.isArray(args) ? args.map(String) : [];
  for (let i = 0; i < input.length; i += 1) {
    const arg = input[i];
    const next = input[i + 1] || '';
    if ((arg === '-c' || arg === '--config') && /^service_tier\s*=/.test(next.trim())) return input;
    if (/^(?:-c|--config)=service_tier\s*=/.test(arg.trim())) return input;
  }
  return ['-c', 'service_tier="fast"', ...input];
}

export function sanitizeTmuxSessionName(input) {
  const base = String(input || 'sks').trim().replace(/[^A-Za-z0-9_.:-]+/g, '-').replace(/^-+|-+$/g, '');
  return (base || 'sks').slice(0, 80);
}

export function defaultTmuxSessionName(root) {
  const base = sanitizeTmuxSessionName(path.basename(root || process.cwd()) || 'project');
  const hash = sha256(path.resolve(root || process.cwd())).slice(0, 8);
  return sanitizeTmuxSessionName(`sks-${base}-${hash}`);
}

export function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export function platformTmuxInstallHint() {
  if (process.platform === 'darwin') return 'Install tmux 3.x or newer: brew install tmux';
  return 'Install tmux 3.x or newer with your OS package manager, then run: sks tmux check';
}

export function tmuxStatePath(root = process.cwd()) {
  return path.join(path.resolve(root || process.cwd()), '.sneakoscope', 'state', 'tmux-sessions.json');
}

export function tmuxTeamStatePath(root = process.cwd()) {
  return path.join(path.resolve(root || process.cwd()), '.sneakoscope', 'state', 'tmux-team-sessions.json');
}

export function tmuxCockpitStatePath(root = process.cwd()) {
  return path.join(path.resolve(root || process.cwd()), '.sneakoscope', 'state', 'tmux-cockpit.json');
}

const TERMINAL_TEAM_AGENT_STATUSES = new Set([
  'agent_closed',
  'agent_done',
  'cancelled',
  'canceled',
  'cleanup',
  'cleanup_requested',
  'closed',
  'complete',
  'completed',
  'done',
  'ended',
  'failed',
  'stopped',
  'terminal',
  'tmux_lane_closed'
]);

const LEGACY_TEAM_PANE_TITLE_RE = /^(?:overview: mission_overview|scout: analysis_scout|plan: (?:debate|consensus|planner|user)|exec: (?:executor|implementation|worker)|review: (?:reviewer|qa|validation)|safety:)/;
const GENERIC_TEAM_AGENT_IDS = new Set(['parent_orchestrator', 'analysis_scout', 'team_consensus', 'implementation_worker', 'db_safety_reviewer', 'qa_reviewer']);
const DYNAMIC_TEAM_TMUX_LAYOUT = 'main-vertical';
const TEAM_TMUX_MAIN_PANE_MIN_WIDTH = 48;
const TEAM_TMUX_MAIN_PANE_WIDTH_RATIO = 0.5;

export function isTmuxShellSession(env = process.env) {
  return Boolean(String(env.TMUX || '').trim());
}

export async function findTmuxBin() {
  return await which('tmux').catch(() => null);
}

function parseTmuxVersion(text = '') {
  const match = String(text || '').match(/tmux\s+([0-9]+(?:\.[0-9]+)?[a-z]?)/i);
  return match ? match[1] : null;
}

function tmuxVersionOk(version = '') {
  const match = String(version || '').match(/^([0-9]+)(?:\.([0-9]+))?/);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2] || 0);
  return major > 3 || (major === 3 && minor >= 0);
}

export async function tmuxReadiness(opts = {}) {
  const bin = opts.bin ?? await findTmuxBin();
  let version = opts.version || null;
  let error = null;
  if (bin && !version) {
    const run = await runProcess(bin, ['-V'], { timeoutMs: 5000, maxOutputBytes: 4096 }).catch((err) => ({ code: 1, stdout: '', stderr: err.message }));
    if (run.code === 0) version = parseTmuxVersion(run.stdout || run.stderr || '');
    else error = run.stderr || run.stdout || 'tmux -V failed';
  }
  const ok = Boolean(bin && version && tmuxVersionOk(version));
  return {
    ok,
    bin: bin || null,
    version,
    min_version: '3.0',
    current_session: isTmuxShellSession(opts.env || process.env),
    error: ok ? null : error || (bin ? `tmux ${version || 'unknown'} is older than 3.0` : 'tmux not found')
  };
}

export function tmuxStatusKind(tmux = {}) {
  return tmux.ok ? 'ok' : 'missing';
}

export function codexLaunchCommand(root, codexBin, codexArgs = []) {
  const extraArgs = forceGpt55CodexArgs(codexArgs);
  return [
    sksLogoIntroCommand(codexBin),
    `printf '\\nProject: %s\\n' ${shellEscape(root)}`,
    'printf \'Runtime: tmux session for Codex CLI\\n\'',
    'printf \'Prompt:  use canonical $ commands, for example $Team or $QA-LOOP\\n\\n\'',
    '[ -f "$HOME/.codex/sks-codex-lb.env" ] && . "$HOME/.codex/sks-codex-lb.env"',
    'sleep 1',
    `exec ${[shellEscape(codexBin), ...extraArgs.map(shellEscape), '--cd', shellEscape(root)].join(' ')}`
  ].join('; ');
}

export function sksLogoIntroCommand(codexBin = 'codex') {
  const staticLogo = `clear; printf '\\033[1;38;5;51m%s\\033[0m\\n' ${shellEscape(SKS_TMUX_LOGO)}`;
  const authenticatedCheck = `${shellEscape(codexBin)} login status >/dev/null 2>&1`;
  const animated = [
    'clear',
    'trap \'printf "\\033[0m\\033[?25h"\' EXIT INT TERM',
    `printf '\\033[?25l'`,
    ...SKS_TMUX_LOGO_ANIMATION_STEPS.flatMap((step) => {
      const style = `${step.bold ? '1;' : ''}38;5;${step.color}`;
      return [
        `printf '\\033[H\\033[J\\033[${style}m%s\\033[0m\\n' ${shellEscape(SKS_TMUX_LOGO_FRAMES[step.frame])}`,
        `sleep ${step.delay}`
      ];
    }),
    `printf '\\033[H\\033[J\\033[1;38;5;51m%s\\033[0m\\n' ${shellEscape(SKS_TMUX_LOGO)}`,
    `printf '\\033[?25h'`,
    'trap - EXIT INT TERM'
  ].join('; ');
  return `if [ -n "\${TMUX:-}" ] || [ "\${SKS_TMUX_LOGO_ANIMATION:-1}" = "0" ] || ${authenticatedCheck}; then ${staticLogo}; else ${animated}; fi`;
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

function selfClosingTeamPaneCommand(command = '') {
  return [
    `SKS_TEAM_PANE_SELF_CLOSE=1 ${command}`,
    'status=$?',
    'if [ "${SKS_TEAM_PANE_SELF_CLOSE:-1}" = "1" ] && [ -n "${TMUX_PANE:-}" ]; then tmux kill-pane -t "$TMUX_PANE" >/dev/null 2>&1 || true; fi',
    'exit "$status"'
  ].join('; ');
}

function compactTeamPaneBanner({ missionId, agentId, phase, style, overview = false } = {}) {
  const role = overview ? 'overview' : `${style.label} (${style.color_name})`;
  return [
    `SKS Team ${missionId}`,
    overview ? 'Overview: live orchestration' : `Agent: ${agentId}`,
    `Lane: ${role}${phase ? ` | Phase: ${phase}` : ''}`,
    overview ? 'Follow: team watch' : `Follow: team lane --agent ${agentId}`,
    `Cleanup: sks team cleanup-tmux ${missionId}`,
    ''
  ];
}

export const TMUX_TEAM_LANE_STYLES = Object.freeze({
  overview: Object.freeze({ role: 'overview', label: 'overview', color_name: 'Blue', color: 'blue', icon: 'layout-dashboard' }),
  scout: Object.freeze({ role: 'scout', label: 'scout', color_name: 'Cyan', color: 'cyan', icon: 'search' }),
  planning: Object.freeze({ role: 'planning', label: 'plan', color_name: 'Yellow', color: 'yellow', icon: 'messages-square' }),
  execution: Object.freeze({ role: 'execution', label: 'exec', color_name: 'Green', color: 'green', icon: 'hammer' }),
  review: Object.freeze({ role: 'review', label: 'review', color_name: 'Red', color: 'red', icon: 'shield-check' }),
  safety: Object.freeze({ role: 'safety', label: 'safety', color_name: 'Magenta', color: 'magenta', icon: 'database' })
});

export function teamLaneStyle(agentId = '') {
  const id = String(agentId || '').toLowerCase();
  if (!id || id === 'mission_overview' || id === 'overview') return TMUX_TEAM_LANE_STYLES.overview;
  if (/analysis|scout/.test(id)) return TMUX_TEAM_LANE_STYLES.scout;
  if (/debate|consensus|planner|user/.test(id)) return TMUX_TEAM_LANE_STYLES.planning;
  if (/db|safety/.test(id)) return TMUX_TEAM_LANE_STYLES.safety;
  if (/review|qa|validation/.test(id)) return TMUX_TEAM_LANE_STYLES.review;
  if (/executor|implementation|worker|developer/.test(id)) return TMUX_TEAM_LANE_STYLES.execution;
  return TMUX_TEAM_LANE_STYLES.planning;
}

function teamLaneTitle(agentId = '') {
  const style = teamLaneStyle(agentId);
  return `${style.label}: ${String(agentId || 'mission_overview')}`.slice(0, 80);
}

export function teamAgentCommand(root, missionId, agentId, phase) {
  const style = teamLaneStyle(agentId);
  const title = teamLaneTitle(agentId);
  const laneCommand = `node ${shellEscape(path.join(packageRoot(), 'bin', 'sks.mjs'))} team lane ${shellEscape(missionId)} --agent ${shellEscape(agentId)} --phase ${shellEscape(phase)} --follow --lines 12`;
  return [
    terminalTitleCommand(title),
    'clear',
    colorizedLaneBannerCommand(compactTeamPaneBanner({ missionId, agentId, phase, style }), style.color),
    `cd ${shellEscape(root)}`,
    selfClosingTeamPaneCommand(laneCommand)
  ].join('; ');
}

export function teamOverviewCommand(root, missionId) {
  const style = teamLaneStyle('mission_overview');
  const title = teamLaneTitle('mission_overview');
  const watchCommand = `node ${shellEscape(path.join(packageRoot(), 'bin', 'sks.mjs'))} team watch ${shellEscape(missionId)} --follow --lines 18`;
  return [
    terminalTitleCommand(title),
    'clear',
    colorizedLaneBannerCommand(compactTeamPaneBanner({ missionId, agentId: 'mission_overview', style, overview: true }), style.color),
    `cd ${shellEscape(root)}`,
    selfClosingTeamPaneCommand(watchCommand)
  ].join('; ');
}

export async function buildTmuxLaunchPlan(opts = {}) {
  const root = path.resolve(opts.root || await sksRoot());
  const session = sanitizeTmuxSessionName(opts.session || opts.workspace || defaultTmuxSessionName(root));
  const sksBin = opts.sksBin || path.join(packageRoot(), 'bin', 'sks.mjs');
  const codex = opts.codex || await getCodexInfo().catch(() => ({}));
  const tmux = opts.tmux || await tmuxReadiness(opts);
  const app = opts.app || await codexAppIntegrationStatus({ codex });
  const codexArgs = forceGpt55CodexArgs(codexArgsWithFastServiceTier(Array.isArray(opts.codexArgs) ? opts.codexArgs : defaultCodexLaunchArgs(opts.env || process.env)));
  return {
    root,
    session,
    workspace: session,
    sksBin,
    codex,
    tmux,
    app,
    codexArgs,
    attach_command: `tmux attach-session -t ${session}`,
    ready: Boolean(tmux.ok && codex.bin),
    warnings: app.ok ? [] : app.guidance || [],
    blockers: [
      ...(!tmux.ok ? [`tmux missing or too old. ${platformTmuxInstallHint()}`] : []),
      ...(!codex.bin ? ['Codex CLI missing. Install: npm i -g @openai/codex, or set SKS_CODEX_BIN.'] : [])
    ]
  };
}

export function formatTmuxBanner(status = null) {
  const lines = [
    SKS_TMUX_LOGO,
    '',
    'SKS tmux runtime',
    '',
    'Canonical prompt commands:',
    '  $DFix  $Answer  $SKS  $Team  $QA-LOOP  $PPT  $Goal  $Research  $AutoResearch  $DB  $GX  $Wiki  $Help',
    '',
    'CLI-first runtime:',
    '  sks                 open or attach the default tmux Codex CLI session',
    '  sks tmux open       open or attach a tmux Codex CLI session with explicit flags',
    '  sks --mad           open one-shot MAD full-access auto-review tmux session',
    '  sks team "task"     prepare Team mission and reconcile Team panes in the current SKS tmux session when available',
    '  sks team open-tmux latest  reopen current-session panes, or use --separate-session for the legacy view',
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

function tmuxRun(bin, args, opts = {}) {
  return runProcess(bin || 'tmux', args, { timeoutMs: opts.timeoutMs || 10000, maxOutputBytes: opts.maxOutputBytes || 32 * 1024 })
    .catch((err) => ({ code: 1, stdout: '', stderr: err.message }));
}

function paneId(stdout = '') {
  const id = String(stdout || '').split(/\r?\n/)[0]?.trim() || '';
  return id.startsWith('%') ? id : null;
}

function currentTerminalDimensions(opts = {}) {
  const width = Number(opts.width || opts.detachedWidth || process.stdout?.columns || process.env.COLUMNS || 0);
  const height = Number(opts.height || opts.detachedHeight || process.stdout?.rows || process.env.LINES || 0);
  return {
    width: String(Math.max(120, Number.isFinite(width) && width > 0 ? width : 120)),
    height: String(Math.max(36, Number.isFinite(height) && height > 0 ? height : 36))
  };
}

async function hasTmuxSession(bin, session) {
  const run = await tmuxRun(bin, ['has-session', '-t', session], { timeoutMs: 5000 });
  return run.code === 0;
}

async function tmuxWindowTarget(bin, session) {
  const fallback = sanitizeTmuxSessionName(session);
  const run = await tmuxRun(bin, ['list-windows', '-t', fallback, '-F', '#{window_id}'], { timeoutMs: 5000, maxOutputBytes: 4096 });
  if (run.code !== 0) return fallback;
  const windowId = String(run.stdout || '').split(/\r?\n/).map((line) => line.trim()).find((line) => /^@\d+$/.test(line));
  return windowId || fallback;
}

async function currentTmuxTarget(bin, env = process.env) {
  if (!isTmuxShellSession(env)) return { ok: false, reason: 'not running inside tmux' };
  const run = await tmuxRun(bin, ['display-message', '-p', '#{session_name}\t#{window_id}\t#{pane_id}'], { timeoutMs: 5000, maxOutputBytes: 4096 });
  if (run.code !== 0) return { ok: false, reason: run.stderr || run.stdout || 'tmux display-message failed' };
  const [session, windowId, paneId] = String(run.stdout || '').trim().split('\t');
  if (!session || !windowId) return { ok: false, reason: 'tmux did not report current session/window' };
  return { ok: true, session: sanitizeTmuxSessionName(session), window_id: windowId, pane_id: paneId || null };
}

async function isRecordedSksTmuxSession(root, session) {
  const state = await readJson(tmuxStatePath(root), {}).catch(() => ({}));
  const sessions = state.sessions && typeof state.sessions === 'object' ? state.sessions : {};
  const record = sessions[sanitizeTmuxSessionName(session)] || null;
  if (!record) return { ok: false, reason: 'current tmux session is not recorded as an SKS session' };
  const recordRoot = path.resolve(record.root || root || process.cwd());
  const resolvedRoot = path.resolve(root || process.cwd());
  if (recordRoot !== resolvedRoot) return { ok: false, reason: `recorded SKS session belongs to ${recordRoot}` };
  return { ok: true, record };
}

function isTerminalTeamAgentStatus(status = '') {
  const normalized = String(status || '').trim().toLowerCase();
  return TERMINAL_TEAM_AGENT_STATUSES.has(normalized) || /(?:^|_)(?:done|complete|completed|closed|cleanup|cancelled|canceled|failed|ended|stopped)(?:_|$)/.test(normalized);
}

function teamCockpitAgentIds(plan = {}, dashboard = null, control = null, opts = {}) {
  if (teamCleanupRequested(control)) return [];
  const visible = teamViewAgentIds(plan).filter((id) => id && id !== 'mission_overview');
  const agents = dashboard?.agents && typeof dashboard.agents === 'object' ? dashboard.agents : null;
  if (!agents) return opts.plannedFallback ? visible : [];
  const concrete = concreteDashboardAgentIds(agents, visible).filter((id) => {
    const status = String(agents[id]?.status || '').trim().toLowerCase();
    return status && status !== 'pending' && !isTerminalTeamAgentStatus(status);
  });
  if (concrete.length) return uniqueAgentIds(concrete);
  const active = [];
  for (const id of visible) {
    const entry = agents[id] || {};
    const status = String(entry.status || '').trim().toLowerCase();
    if (!status || status === 'pending') continue;
    if (isTerminalTeamAgentStatus(status)) continue;
    active.push(id);
  }
  if (!active.length && opts.plannedFallback) return visible;
  return uniqueAgentIds(active);
}

function concreteDashboardAgentIds(agents = {}, planned = []) {
  const plannedSet = new Set(planned);
  const concrete = Object.keys(agents)
    .filter((id) => id && !plannedSet.has(id))
    .filter((id) => !GENERIC_TEAM_AGENT_IDS.has(id))
    .filter((id) => !/_(?:\d+)$/.test(id));
  if (!concrete.length) return [];
  const plannedRoles = new Set(planned.map((id) => teamLaneStyle(id).role));
  return concrete.filter((id) => plannedRoles.has(teamLaneStyle(id).role));
}

function teamCockpitLanes(plan = {}, dashboard = null, control = null, opts = {}) {
  const agents = teamCockpitAgentIds(plan, dashboard, control, opts);
  if (!agents.length) return [];
  const overview = { agent: 'mission_overview', role: 'overview', command: teamOverviewCommand(opts.root, opts.missionId), style: teamLaneStyle('mission_overview'), title: teamLaneTitle('mission_overview') };
  return [
    overview,
    ...agents.map((agent) => {
      const style = teamLaneStyle(agent);
      return {
        agent,
        role: style.role,
        command: teamAgentCommand(opts.root, opts.missionId, agent, teamLanePhase(agent)),
        style,
        title: teamLaneTitle(agent)
      };
    })
  ];
}

function parseTmuxPaneLines(stdout = '') {
  return String(stdout || '').split(/\r?\n/).filter(Boolean).map((line) => {
    const [pane_id, title, command, managed, mission_id, agent, role] = line.split('\t');
    return {
      pane_id,
      title: title || '',
      command: command || '',
      managed: managed === '1' || managed === 'true',
      mission_id: mission_id || '',
      agent: agent || '',
      role: role || ''
    };
  }).filter((pane) => /^%\d+$/.test(pane.pane_id || ''));
}

function isLegacyTeamPane(pane = {}) {
  return LEGACY_TEAM_PANE_TITLE_RE.test(String(pane.title || '').trim());
}

async function listTmuxWindowPanes(bin, windowId) {
  const format = ['#{pane_id}', '#{pane_title}', '#{pane_current_command}', '#{@sks_team_managed}', '#{@sks_mission_id}', '#{@sks_agent_id}', '#{@sks_lane_role}'].join('\t');
  const run = await tmuxRun(bin, ['list-panes', '-t', windowId, '-F', format], { timeoutMs: 5000, maxOutputBytes: 32 * 1024 });
  if (run.code !== 0) return { ok: false, panes: [], stderr: run.stderr || run.stdout || 'tmux list-panes failed' };
  return { ok: true, panes: parseTmuxPaneLines(run.stdout) };
}

async function tmuxPaneExists(bin, paneId) {
  if (!paneId || !String(paneId).startsWith('%')) return false;
  const run = await tmuxRun(bin, ['list-panes', '-t', paneId, '-F', '#{pane_dead}\t#{pane_id}'], { timeoutMs: 5000, maxOutputBytes: 4096 });
  if (run.code !== 0) return false;
  return String(run.stdout || '').split(/\r?\n/).some((line) => {
    const [dead = '', id = ''] = line.trim().split('\t');
    return id === paneId && dead !== '1';
  });
}

async function setTmuxPaneUserOptions(bin, paneId, options = {}) {
  const applied = [];
  const failed = [];
  for (const [key, value] of Object.entries(options)) {
    const run = await tmuxRun(bin, ['set-option', '-pt', paneId, key, String(value)], { timeoutMs: 5000 });
    const command = [path.basename(bin), 'set-option', '-pt', paneId, key, String(value)].join(' ');
    if (run.code === 0) applied.push(command);
    else failed.push({ command, stderr: run.stderr || run.stdout || 'tmux set-option failed' });
  }
  return { applied, failed };
}

async function writeTmuxCockpitRecord(root, record = {}) {
  if (!record.mission_id || !record.session) return null;
  const statePath = tmuxCockpitStatePath(root);
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

function tmuxLayoutName(value = 'tiled') {
  const layout = String(value || 'tiled').trim();
  return /^(tiled|even-horizontal|even-vertical|main-horizontal|main-horizontal-mirrored|main-vertical|main-vertical-mirrored)$/.test(layout)
    ? layout
    : 'tiled';
}

function teamMainPaneWidthFromWindow(width) {
  const n = Number(width);
  if (!Number.isFinite(n) || n <= 0) return TEAM_TMUX_MAIN_PANE_MIN_WIDTH;
  return Math.max(TEAM_TMUX_MAIN_PANE_MIN_WIDTH, Math.floor(n * TEAM_TMUX_MAIN_PANE_WIDTH_RATIO));
}

async function applyStableTeamLayout(tmuxBin, target, mainPaneId = null, opts = {}) {
  const layout = tmuxLayoutName(opts.layout || DYNAMIC_TEAM_TMUX_LAYOUT);
  const windowTarget = target || mainPaneId;
  const applied = [];
  const failed = [];
  const runAndRecord = async (args) => {
    const run = await tmuxRun(tmuxBin, args, { timeoutMs: 5000 });
    const command = [path.basename(tmuxBin), ...args].join(' ');
    if (run.code === 0) applied.push(command);
    else failed.push({ command, stderr: run.stderr || run.stdout || 'tmux command failed' });
    return run;
  };
  if (mainPaneId) await runAndRecord(['select-pane', '-t', mainPaneId]);
  const width = await tmuxRun(tmuxBin, ['display-message', '-p', '-t', windowTarget, '#{window_width}'], { timeoutMs: 5000, maxOutputBytes: 1024 });
  if (width.code === 0) {
    const mainWidth = teamMainPaneWidthFromWindow(String(width.stdout || '').trim());
    await runAndRecord(['set-window-option', '-t', windowTarget, 'main-pane-width', String(mainWidth)]);
  }
  await runAndRecord(['select-layout', '-t', windowTarget, layout]);
  return { ok: failed.length === 0, layout_name: layout, applied, failed };
}

async function enableTmuxDynamicResize(tmuxBin, session, opts = {}) {
  const layout = tmuxLayoutName(opts.layout || 'tiled');
  const safeSession = sanitizeTmuxSessionName(session);
  const target = await tmuxWindowTarget(tmuxBin, safeSession);
  const stableMainVertical = layout === DYNAMIC_TEAM_TMUX_LAYOUT && opts.stableTeamLayout;
  const tmuxShell = shellEscape(tmuxBin || 'tmux');
  const targetShell = shellEscape(target);
  const stableRelayoutShell = [
    `${tmuxShell} resize-window -t ${targetShell} -A >/dev/null 2>&1 || true`,
    `${tmuxShell} set-window-option -t ${targetShell} window-size latest >/dev/null 2>&1 || true`,
    `w=$(${tmuxShell} display-message -p -t ${targetShell} '#{window_width}' 2>/dev/null || printf 120)`,
    `if [ "$w" -gt 0 ] 2>/dev/null; then ${tmuxShell} set-window-option -t ${targetShell} main-pane-width $((w / 2)) >/dev/null 2>&1 || true; fi`,
    `${tmuxShell} select-layout -t ${targetShell} ${layout} >/dev/null 2>&1 || true`,
    `${tmuxShell} set-window-option -t ${targetShell} window-size latest >/dev/null 2>&1 || true`
  ].join('; ');
  const relayout = stableMainVertical
    ? `run-shell -b ${shellEscape(stableRelayoutShell)}`
    : `resize-window -t ${target} -A; set-window-option -t ${target} window-size latest; select-layout -t ${target} ${layout}; select-layout -t ${target} -E; set-window-option -t ${target} window-size latest`;
  const commands = [
    ['set-window-option', '-t', target, 'window-size', 'latest'],
    ['set-window-option', '-t', target, 'aggressive-resize', 'on'],
    ['set-hook', '-t', safeSession, 'client-attached', relayout],
    ['set-hook', '-t', safeSession, 'client-resized', relayout],
    ['resize-window', '-t', target, '-A'],
    ['set-window-option', '-t', target, 'window-size', 'latest'],
    ...(stableMainVertical ? [] : [['select-layout', '-t', target, layout], ['select-layout', '-t', target, '-E']]),
    ...(stableMainVertical ? [['display-message', '-p', '-t', target, '#{window_width}'], ['select-layout', '-t', target, layout]] : []),
    ['set-window-option', '-t', target, 'window-size', 'latest']
  ];
  const applied = [];
  const failed = [];
  for (const args of commands) {
    const run = await tmuxRun(tmuxBin, args, { timeoutMs: 5000 });
    const command = [path.basename(tmuxBin), ...args].join(' ');
    if (run.code === 0) applied.push(command);
    else failed.push({ command, stderr: run.stderr || run.stdout || 'tmux command failed' });
  }
  return { enabled: failed.length === 0, layout, applied, failed };
}

export function buildTmuxOpenArgs(plan = {}) {
  return ['attach-session', '-t', sanitizeTmuxSessionName(plan.session || plan.workspace || defaultTmuxSessionName(plan.root))];
}

export function shouldAutoAttachTmux(args = [], env = process.env, streams = {}) {
  const stdin = streams.stdin || process.stdin;
  const stdout = streams.stdout || process.stdout;
  if (args.includes('--json') || args.includes('--status-only') || args.includes('--quiet') || args.includes('--no-attach')) return false;
  if (String(env.SKS_TMUX_NO_AUTO_ATTACH || '') === '1') return false;
  return Boolean(stdin?.isTTY && stdout?.isTTY);
}

function attachTmuxSession(plan = {}, args = [], opts = {}) {
  const session = sanitizeTmuxSessionName(plan.session || plan.workspace || defaultTmuxSessionName(plan.root));
  const tmuxBin = plan.tmux?.bin || 'tmux';
  const attachArgs = isTmuxShellSession(opts.env || process.env) ? ['switch-client', '-t', session] : buildTmuxOpenArgs({ ...plan, session });
  console.log(`Attaching: ${[path.basename(tmuxBin), ...attachArgs].join(' ')}`);
  const attached = spawnSync(tmuxBin, attachArgs, { stdio: 'inherit' });
  return {
    ok: attached.status === 0,
    status: attached.status,
    signal: attached.signal || null,
    command: [tmuxBin, ...attachArgs].join(' ')
  };
}

export function runTmuxLaunchPlanSyntaxCheck(plan = {}) {
  const args = buildTmuxOpenArgs(plan);
  return {
    ok: args[0] === 'attach-session' && args[1] === '-t' && Boolean(args[2]),
    has_session: Boolean(args[2]),
    command: ['tmux', ...args].join(' ')
  };
}

export async function createTmuxSession(plan = {}, panes = [], opts = {}) {
  const tmuxBin = plan.tmux?.bin || await findTmuxBin() || 'tmux';
  const session = sanitizeTmuxSessionName(plan.session || plan.workspace || defaultTmuxSessionName(plan.root));
  const root = path.resolve(plan.root || process.cwd());
  const normalizedPanes = panes.length ? panes : [{ cwd: root, command: plan.command || codexLaunchCommand(root, plan.codex?.bin || 'codex', plan.codexArgs), focused: true }];
  if (await hasTmuxSession(tmuxBin, session)) {
    if (opts.recreate || opts.replaceExisting) {
      const killed = await tmuxRun(tmuxBin, ['kill-session', '-t', session], { timeoutMs: 5000 });
      if (killed.code !== 0) return { ok: false, session, panes: [], stderr: killed.stderr || killed.stdout || 'tmux kill-session failed' };
    } else {
      return { ok: true, reused: true, session, panes: [], attach_command: `tmux attach-session -t ${session}` };
    }
  }
  const first = normalizedPanes[0] || { cwd: root, command: 'pwd' };
  const dimensions = currentTerminalDimensions(opts);
  const rightSidePanes = Boolean(opts.rightSidePanes || opts.rightSideOnly);
  const layout = tmuxLayoutName(opts.layout || (rightSidePanes ? DYNAMIC_TEAM_TMUX_LAYOUT : 'tiled'));
  const create = await tmuxRun(tmuxBin, ['new-session', '-d', '-x', dimensions.width, '-y', dimensions.height, '-s', session, '-c', path.resolve(first.cwd || root), '-n', 'sks', '-P', '-F', '#{pane_id}', first.command || 'pwd']);
  if (create.code !== 0) return { ok: false, session, panes: [], stderr: create.stderr || create.stdout || 'tmux new-session failed' };
  const created = [{ pane_id: paneId(create.stdout), role: first.role || 'overview', title: first.title || 'overview' }];
  let rightStackRootPaneId = null;
  for (const pane of normalizedPanes.slice(1)) {
    const direction = rightSidePanes ? (created.length === 1 ? '-h' : '-v') : (pane.vertical ? '-v' : '-h');
    const splitTarget = rightSidePanes ? (rightStackRootPaneId || created[0].pane_id || session) : session;
    const split = await tmuxRun(tmuxBin, ['split-window', '-t', splitTarget, direction, '-d', '-P', '-F', '#{pane_id}', '-c', path.resolve(pane.cwd || root), pane.command || 'pwd']);
    if (split.code !== 0) return { ok: false, session, panes: created, stderr: split.stderr || split.stdout || 'tmux split-window failed' };
    const newPaneId = paneId(split.stdout);
    if (newPaneId && !(await tmuxPaneExists(tmuxBin, newPaneId))) return { ok: false, session, panes: created, stderr: `tmux split-window returned pane ${newPaneId}, but the pane was not present after creation` };
    created.push({ pane_id: newPaneId, role: pane.role || 'lane', title: pane.title || null });
    if (rightSidePanes && !rightStackRootPaneId && newPaneId) rightStackRootPaneId = newPaneId;
    if (!rightSidePanes) await tmuxRun(tmuxBin, ['select-layout', '-t', session, layout]).catch(() => null);
  }
  const stable_layout = rightSidePanes ? await applyStableTeamLayout(tmuxBin, session, created[0].pane_id, { layout }) : null;
  const dynamic_resize = await enableTmuxDynamicResize(tmuxBin, session, { layout, stableTeamLayout: rightSidePanes });
  return { ok: true, reused: false, session, panes: created, attach_command: `tmux attach-session -t ${session}`, layout, initial_size: dimensions, stable_layout, dynamic_resize };
}

export async function launchTmuxUi(args = [], opts = {}) {
  const rootArg = readOption(args, '--root', opts.root);
  const sessionArg = readOption(args, '--session', readOption(args, '--workspace', opts.session || opts.workspace));
  const plan = await buildTmuxLaunchPlan({ ...opts, root: rootArg, session: sessionArg });
  if (args.includes('--json')) return { plan };
  if (!plan.ready && !args.includes('--status-only')) {
    printTmuxLaunchBlocked(plan, { concise: opts.conciseBlockers });
    process.exitCode = 1;
    return { plan };
  }
  if (args.includes('--status-only')) return { plan };
  const command = codexLaunchCommand(plan.root, plan.codex.bin, plan.codexArgs);
  const created = await createTmuxSession({ ...plan, command }, [{ cwd: plan.root, command, focused: true, role: 'codex', title: 'Codex CLI' }]);
  if (created.ok) await writeTmuxSessionRecord(plan.root, { session: created.session, attach_command: created.attach_command, panes: created.panes }).catch(() => null);
  if (!args.includes('--quiet')) {
    console.log(`SKS tmux session: ${created.session || plan.session}`);
    if (created.ok && created.reused) console.log('tmux: reused existing session');
    else if (created.ok) console.log(`tmux: created ${created.panes.length} pane(s)`);
    else console.log(`tmux: not created (${created.stderr || 'tmux failed'})`);
    if (created.ok) console.log(`Attach: ${created.attach_command}`);
  }
  let attached = null;
  if (created.ok && shouldAutoAttachTmux(args)) {
    attached = attachTmuxSession({ ...plan, session: created.session || plan.session }, args);
    if (!attached.ok) {
      const status = attached.signal || (attached.status ?? 'unknown');
      console.error(`SKS tmux attach failed (${status}). Run manually: ${created.attach_command}`);
      process.exitCode = attached.status || 1;
    }
  }
  return { plan, created: Boolean(created.ok), session: created.session || plan.session, opened: created, attached };
}

export async function launchMadTmuxUi(args = [], opts = {}) {
  const rootArg = readOption(args, '--root', opts.root);
  const sessionArg = readOption(args, '--session', readOption(args, '--workspace', opts.session || opts.workspace));
  const plan = await buildTmuxLaunchPlan({ ...opts, root: rootArg, session: sessionArg });
  if (args.includes('--json')) return { plan };
  if (!plan.ready && !args.includes('--status-only')) {
    printTmuxLaunchBlocked(plan, { concise: opts.conciseBlockers });
    process.exitCode = 1;
    return { plan };
  }
  if (args.includes('--status-only')) return { plan };
  const missionId = opts.missionId || opts.madMissionId || 'latest';
  const mainCommand = codexLaunchCommand(plan.root, plan.codex.bin, plan.codexArgs);
  const panes = [
    { cwd: plan.root, command: mainCommand, focused: true, role: 'codex', title: 'Codex CLI' }
  ];
  const created = await createTmuxSession({ ...plan, command: mainCommand }, panes, { recreate: true });
  if (created.ok) await writeTmuxSessionRecord(plan.root, { session: created.session, attach_command: created.attach_command, panes: created.panes, mode: 'mad_session', mission_id: missionId }).catch(() => null);
  if (!args.includes('--quiet')) {
    console.log(`SKS MAD tmux session: ${created.session || plan.session}`);
    if (created.ok) console.log(`tmux: opened ${created.panes.length} pane(s)`);
    else console.log(`tmux: not created (${created.stderr || 'tmux failed'})`);
    if (created.ok) console.log(`Attach: ${created.attach_command}`);
  }
  let attached = null;
  if (created.ok && shouldAutoAttachTmux(args)) {
    attached = attachTmuxSession({ ...plan, session: created.session || plan.session }, args);
    if (!attached.ok) {
      const status = attached.signal || (attached.status ?? 'unknown');
      console.error(`SKS tmux attach failed (${status}). Run manually: ${created.attach_command}`);
      process.exitCode = attached.status || 1;
    }
  }
  return { plan, created: Boolean(created.ok), session: created.session || plan.session, opened: created, attached, mode: 'mad_session', mission_id: missionId };
}

function printTmuxLaunchBlocked(plan, opts = {}) {
  if (opts.concise) {
    console.error('SKS tmux launch blocked.');
    if (!plan.tmux.ok) console.error(`- tmux missing: ${platformTmuxInstallHint()}`);
    if (!plan.codex.bin) console.error('- Codex CLI missing. Install: npm i -g @openai/codex@latest, or set SKS_CODEX_BIN.');
    return;
  }
  console.log(formatTmuxBanner(plan.app));
  console.log('\nLaunch blocked:\n');
  for (const blocker of Array.from(new Set(plan.blockers))) console.log(`- ${blocker}`);
}

function uniqueAgentIds(agents = []) {
  const ids = [];
  const seen = new Set();
  for (const agent of agents) {
    const id = agent?.id || String(agent || '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function teamViewAgentIds(plan = {}) {
  const roster = plan.roster || {};
  const analysis = uniqueAgentIds(roster.analysis_team || []);
  const debate = uniqueAgentIds(roster.debate_team || []);
  const development = uniqueAgentIds(roster.development_team || []);
  const validation = uniqueAgentIds(roster.validation_team || []);
  const reviewers = validation.filter((id) => teamLaneStyle(id).role === 'review');
  const reviewerTarget = Math.max(MIN_TEAM_REVIEWER_LANES, Number(plan.review_policy?.minimum_reviewer_lanes) || 0, Number(plan.role_counts?.reviewer) || 0);
  const reviewLanes = reviewers.slice(0, reviewerTarget);
  const phaseRepresentatives = [development[0], debate[0]].filter(Boolean);
  const requiredVisible = [...analysis, ...reviewLanes, ...phaseRepresentatives];
  const ordered = [...requiredVisible, ...debate, ...development, ...validation];
  const limit = Math.max(Number(plan.agent_session_count) || MIN_TEAM_REVIEWER_LANES, requiredVisible.length);
  return uniqueAgentIds(ordered).slice(0, Math.max(1, limit));
}

function teamLanePhase(agentId = '') {
  const role = teamLaneStyle(agentId).role;
  if (role === 'review') return 'review';
  if (role === 'execution') return 'implementation';
  if (role === 'scout') return 'analysis';
  if (role === 'safety') return 'safety';
  return 'team';
}

export async function reconcileTmuxTeamCockpit({ root, missionId, plan = {}, promptFile = null, dashboard = undefined, control = undefined, close = false, plannedFallback = false, env = process.env, tmux = null } = {}) {
  const resolvedRoot = path.resolve(root || await sksRoot());
  const id = missionId || 'latest';
  if (String(env.SKS_TMUX_DYNAMIC_TEAM || '1') === '0') return { ok: false, skipped: true, reason: 'SKS_TMUX_DYNAMIC_TEAM=0' };
  const tmuxBin = tmux?.bin || await findTmuxBin() || 'tmux';
  const target = await currentTmuxTarget(tmuxBin, env);
  if (!target.ok) return { ok: false, skipped: true, reason: target.reason };
  const ownership = await isRecordedSksTmuxSession(resolvedRoot, target.session);
  if (!ownership.ok) return { ok: false, skipped: true, session: target.session, reason: ownership.reason };
  const missionDir = path.join(resolvedRoot, '.sneakoscope', 'missions', id);
  const loadedDashboard = dashboard === undefined ? await readTeamDashboard(missionDir).catch(() => null) : dashboard;
  const loadedControl = control === undefined ? await readTeamControl(missionDir).catch(() => null) : control;
  const lanes = close
    ? []
    : teamCockpitLanes(plan, loadedDashboard, loadedControl, { root: resolvedRoot, missionId: id, plannedFallback });
  const desiredAgents = new Set(lanes.map((lane) => lane.agent));
  const paneList = await listTmuxWindowPanes(tmuxBin, target.window_id);
  if (!paneList.ok) return { ok: false, skipped: false, session: target.session, window_id: target.window_id, reason: paneList.stderr };
  const cockpitState = await readJson(tmuxCockpitStatePath(resolvedRoot), {}).catch(() => ({}));
  const previousCockpit = cockpitState?.missions?.[id] || {};
  const currentPane = paneList.panes.find((pane) => pane.pane_id === target.pane_id);
  const mainPaneId = previousCockpit.main_pane_id || (currentPane?.managed && currentPane?.mission_id === id ? null : target.pane_id);
  const managed = paneList.panes.filter((pane) => pane.managed && pane.mission_id === id);
  const byAgent = new Map();
  for (const pane of managed) {
    if (pane.agent && !byAgent.has(pane.agent)) byAgent.set(pane.agent, pane);
  }
  const opened = [];
  const closed = [];
  const failed = [];
  for (const pane of managed) {
    if (!desiredAgents.has(pane.agent)) {
      const kill = await tmuxRun(tmuxBin, ['kill-pane', '-t', pane.pane_id], { timeoutMs: 5000 });
      if (kill.code === 0) closed.push({ pane_id: pane.pane_id, agent: pane.agent, role: pane.role });
      else failed.push({ action: 'kill-pane', pane_id: pane.pane_id, agent: pane.agent, stderr: kill.stderr || kill.stdout || 'tmux kill-pane failed' });
    }
  }
  const remainingManaged = managed.filter((pane) => desiredAgents.has(pane.agent) && !closed.some((entry) => entry.pane_id === pane.pane_id));
  let rightStackRootPaneId = remainingManaged[0]?.pane_id || null;
  for (const lane of lanes) {
    if (byAgent.has(lane.agent)) continue;
    const firstRightPane = remainingManaged.length === 0 && opened.length === 0;
    const direction = firstRightPane ? '-h' : '-v';
    const splitTarget = firstRightPane ? (mainPaneId || target.window_id) : (rightStackRootPaneId || mainPaneId || target.window_id);
    const split = await tmuxRun(tmuxBin, ['split-window', direction, '-t', splitTarget, '-d', '-P', '-F', '#{pane_id}', '-c', resolvedRoot, lane.command || 'pwd'], { timeoutMs: 5000, maxOutputBytes: 4096 });
    const pane_id = paneId(split.stdout);
    if (split.code !== 0 || !pane_id) {
      failed.push({ action: 'split-window', agent: lane.agent, role: lane.role, stderr: split.stderr || split.stdout || 'tmux split-window failed' });
      continue;
    }
    if (!(await tmuxPaneExists(tmuxBin, pane_id))) {
      failed.push({ action: 'verify-pane', pane_id, agent: lane.agent, role: lane.role, stderr: 'tmux split-window returned a pane id, but the pane was not present after creation' });
      continue;
    }
    if (!rightStackRootPaneId) rightStackRootPaneId = pane_id;
    const optionResult = await setTmuxPaneUserOptions(tmuxBin, pane_id, {
      '@sks_team_managed': '1',
      '@sks_mission_id': id,
      '@sks_agent_id': lane.agent,
      '@sks_lane_role': lane.role || teamLaneStyle(lane.agent).role
    });
    failed.push(...optionResult.failed.map((entry) => ({ action: 'set-option', agent: lane.agent, role: lane.role, ...entry })));
    opened.push({ pane_id, agent: lane.agent, role: lane.role, title: lane.title });
  }
  let relayout = null;
  if (opened.length || closed.length) {
    relayout = await applyStableTeamLayout(tmuxBin, target.window_id, mainPaneId, { layout: DYNAMIC_TEAM_TMUX_LAYOUT });
  }
  const nextPanes = [
    ...managed.filter((pane) => desiredAgents.has(pane.agent) && !closed.some((entry) => entry.pane_id === pane.pane_id)),
    ...opened
  ];
  await writeTmuxCockpitRecord(resolvedRoot, {
    mission_id: id,
    session: target.session,
    window_id: target.window_id,
    main_pane_id: mainPaneId || target.pane_id,
    mode: 'current_session_dynamic_panes',
    layout: DYNAMIC_TEAM_TMUX_LAYOUT,
    right_side_only: true,
    desired_lane_count: lanes.length,
    panes: nextPanes,
    opened,
    closed,
    failed
  }).catch(() => null);
  return {
    ok: failed.length === 0,
    mode: 'current_session_dynamic_panes',
    session: target.session,
    window_id: target.window_id,
    main_pane_id: mainPaneId || target.pane_id,
    desired_lane_count: lanes.length,
    opened_lane_count: opened.length,
    closed_lane_count: closed.length,
    managed_lane_count: nextPanes.length,
    opened,
    closed,
    failed,
    relayout,
    attach_command: `tmux attach-session -t ${target.session}`,
    cleanup_policy: 'managed Team panes are reconciled in the current SKS tmux session; main Codex pane is never killed'
  };
}

export async function launchTmuxTeamView({ root, missionId, plan = {}, promptFile = null, json = false, attach = false, args = [] } = {}) {
  const launch = await buildTmuxLaunchPlan({ root, session: `sks-team-${missionId}` });
  const missionDir = path.join(launch.root, '.sneakoscope', 'missions', missionId);
  const dashboard = await readTeamDashboard(missionDir).catch(() => null);
  const control = await readTeamControl(missionDir).catch(() => null);
  const plannedAgents = teamViewAgentIds(plan);
  const concreteAgents = concreteDashboardAgentIds(dashboard?.agents || {}, plannedAgents);
  const cleanupRequested = teamCleanupRequested(control);
  const visibleAgents = cleanupRequested ? [] : (json ? plannedAgents : (concreteAgents.length ? concreteAgents : plannedAgents));
  const commands = visibleAgents.map((agentId) => ({
    agent: agentId,
    command: teamAgentCommand(launch.root, missionId, agentId, teamLanePhase(agentId), promptFile),
    style: teamLaneStyle(agentId),
    title: teamLaneTitle(agentId)
  }));
  const overview = { agent: 'mission_overview', role: 'overview', command: teamOverviewCommand(launch.root, missionId), style: teamLaneStyle('mission_overview'), title: teamLaneTitle('mission_overview') };
  const lanes = cleanupRequested ? [] : [overview, ...commands.map((entry) => ({ ...entry, role: entry.style.role }))];
  const splitUi = {
    mode: 'single_window_split_panes',
    window: 'sks',
    layout: DYNAMIC_TEAM_TMUX_LAYOUT,
    right_side_only: true,
    dynamic_resize: true,
    window_size: 'latest',
    resize_hooks: ['client-attached', 'client-resized'],
    live_updates: true,
    panes_show: ['overview', 'scout', 'planning', 'execution', 'review', 'safety'],
    user_attach_command: launch.attach_command
  };
  const result = {
    ready: launch.ready,
    tmux: launch.tmux,
    session: launch.session,
    workspace: launch.session,
    overview,
    agents: commands,
    lanes,
    split_ui: splitUi,
    cleanup_policy: 'mark-complete; close SKS-managed Team panes; main Codex pane remains user controlled',
    blockers: launch.blockers,
    attach_command: launch.attach_command
  };
  if (json || !launch.ready) return result;
  const wantsSeparateSession = args.includes('--separate-session') || args.includes('--new-session') || args.includes('--legacy-team-session') || args.includes('--no-dynamic-team-tmux');
  if (!wantsSeparateSession) {
    const cockpit = await reconcileTmuxTeamCockpit({ root: launch.root, missionId, plan, promptFile, dashboard, control, plannedFallback: true });
    result.dynamic_cockpit = cockpit;
    if (cockpit.ok) {
      result.created = true;
      result.opened = cockpit;
      result.session = cockpit.session;
      result.workspace = cockpit.session;
      result.opened_lane_count = cockpit.managed_lane_count;
      result.all_lanes_opened = cockpit.desired_lane_count === cockpit.managed_lane_count;
      result.ready = true;
      result.attach_command = cockpit.attach_command;
      result.cleanup_policy = cockpit.cleanup_policy;
      result.split_ui = {
        ...splitUi,
        mode: cockpit.mode,
        current_session: true,
        window_id: cockpit.window_id,
        main_pane_id: cockpit.main_pane_id,
        layout: cockpit.relayout?.layout_name || DYNAMIC_TEAM_TMUX_LAYOUT,
        user_attach_command: cockpit.attach_command
      };
      await writeTmuxTeamRecord(launch.root, {
        mission_id: missionId,
        session: cockpit.session,
        attach_command: cockpit.attach_command,
        split_ui: result.split_ui,
        cleanup_policy: result.cleanup_policy,
        panes: cockpit.opened || [],
        lanes: lanes.map((entry) => ({
          agent: entry.agent,
          role: entry.style?.role || teamLaneStyle(entry.agent).role,
          style: entry.style || teamLaneStyle(entry.agent),
          title: entry.title || teamLaneTitle(entry.agent)
        })),
        mode: cockpit.mode,
        window_id: cockpit.window_id
      }).catch(() => null);
      if (cockpit.opened?.length) {
        const dir = path.join(launch.root, '.sneakoscope', 'missions', missionId);
        if (await exists(dir)) {
          for (const lane of cockpit.opened) {
            if (!lane.agent || lane.agent === 'mission_overview') continue;
            await appendTeamEvent(dir, {
              agent: lane.agent,
              phase: teamLanePhase(lane.agent),
              type: 'tmux_lane_opened',
              message: `tmux pane opened for ${lane.agent}; following live lane activity in the current SKS tmux session.`
            }).catch(() => null);
          }
        }
      }
      return result;
    }
  }
  const panes = lanes.map((lane, index) => ({ cwd: launch.root, command: lane.command, focused: index === 0, role: lane.role, title: lane.title, vertical: index > 1 }));
  const created = await createTmuxSession(launch, panes, { layout: DYNAMIC_TEAM_TMUX_LAYOUT, recreate: true, rightSidePanes: true });
  result.created = Boolean(created.ok);
  result.opened = created;
  result.session = created.session || launch.session;
  result.opened_lane_count = created.panes?.length || lanes.length;
  result.all_lanes_opened = Boolean(created.ok);
  result.ready = Boolean(result.ready && created.ok);
  result.attach_command = created.attach_command || launch.attach_command;
  await writeTmuxTeamRecord(launch.root, {
    mission_id: missionId,
    session: result.session,
    attach_command: created.attach_command || launch.attach_command,
    split_ui: splitUi,
    cleanup_policy: result.cleanup_policy,
    panes: created.panes || [],
    lanes: lanes.map((entry) => ({
      agent: entry.agent,
      role: entry.style?.role || teamLaneStyle(entry.agent).role,
      style: entry.style || teamLaneStyle(entry.agent),
      title: entry.title || teamLaneTitle(entry.agent)
    }))
  }).catch(() => null);
  if (created.ok) {
    const dir = path.join(launch.root, '.sneakoscope', 'missions', missionId);
    if (await exists(dir)) {
      for (const lane of lanes) {
        if (!lane.agent || lane.agent === 'mission_overview') continue;
        await appendTeamEvent(dir, {
          agent: lane.agent,
          phase: teamLanePhase(lane.agent),
          type: 'tmux_lane_opened',
          message: `tmux pane opened for ${lane.agent}; following live lane activity in split Team view.`
        }).catch(() => null);
      }
    }
  }
  if (created.ok && attach && shouldAutoAttachTmux(args)) {
    result.attached = attachTmuxSession({ ...launch, session: result.session }, args);
    if (!result.attached.ok) {
      const status = result.attached.signal || (result.attached.status ?? 'unknown');
      console.error(`SKS Team tmux attach failed (${status}). Run manually: ${result.attach_command}`);
      process.exitCode = result.attached.status || 1;
    }
  }
  return result;
}

async function writeTmuxSessionRecord(root, record = {}) {
  if (!record.session) return null;
  const statePath = tmuxStatePath(root);
  const state = await readJson(statePath, {}).catch(() => ({}));
  const now = nowIso();
  const nextRecord = { ...record, schema_version: 1, root: path.resolve(root || process.cwd()), updated_at: now };
  const sessions = state.sessions && typeof state.sessions === 'object' ? state.sessions : {};
  await writeJsonAtomic(statePath, {
    schema_version: 1,
    updated_at: now,
    sessions: { ...sessions, [record.session]: nextRecord }
  });
  return nextRecord;
}

async function writeTmuxTeamRecord(root, record = {}) {
  if (!record.mission_id || !record.session) return null;
  const statePath = tmuxTeamStatePath(root);
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

async function readTmuxTeamRecord(root, missionId) {
  const state = await readJson(tmuxTeamStatePath(root), {}).catch(() => ({}));
  const missions = state.missions && typeof state.missions === 'object' ? state.missions : {};
  if (missionId && missionId !== 'latest') return missions[missionId] || null;
  const records = Object.values(missions).filter((entry) => entry && typeof entry === 'object');
  records.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  return records[0] || null;
}

export async function cleanupTmuxTeamView({ root, missionId = 'latest', closeSession = false } = {}) {
  const resolvedRoot = path.resolve(root || await sksRoot());
  const record = await readTmuxTeamRecord(resolvedRoot, missionId);
  if (!record?.session) {
    const legacy = await cleanupLegacyTmuxTeamSurfaces(resolvedRoot, missionId, { closeSession }).catch((err) => ({ ok: false, skipped: true, reason: err.message || 'legacy tmux cleanup failed' }));
    return {
      ok: legacy.ok,
      skipped: legacy.closed_lane_count === 0 && !legacy.killed_session,
      reason: legacy.reason,
      mission_id: missionId,
      legacy_cleanup: legacy,
      requested_close_surfaces: legacy.requested_close_surfaces || 0,
      closed_surfaces: legacy.closed_lane_count || (legacy.killed_session ? 1 : 0)
    };
  }
  const dynamicCleanup = await reconcileTmuxTeamCockpit({ root: resolvedRoot, missionId: record.mission_id || missionId, close: true }).catch((err) => ({ ok: false, skipped: true, reason: err.message || 'dynamic tmux cleanup failed' }));
  const recordedCleanup = dynamicCleanup?.ok && dynamicCleanup.closed_lane_count > 0
    ? null
    : await cleanupRecordedTmuxTeamPanes(resolvedRoot, record.mission_id || missionId, record).catch((err) => ({ ok: false, skipped: true, reason: err.message || 'recorded tmux cleanup failed' }));
  const legacyCleanup = (dynamicCleanup?.closed_lane_count || recordedCleanup?.closed_lane_count)
    ? null
    : await cleanupLegacyTmuxTeamSurfaces(resolvedRoot, record.mission_id || missionId, { closeSession: false }).catch((err) => ({ ok: false, skipped: true, reason: err.message || 'legacy tmux cleanup failed' }));
  let killed_session = false;
  if ((closeSession || closeSession === true) && record.mode !== 'current_session_dynamic_panes') {
    const tmuxBin = await findTmuxBin() || 'tmux';
    const kill = await tmuxRun(tmuxBin, ['kill-session', '-t', record.session], { timeoutMs: 5000 });
    killed_session = kill.code === 0;
  }
  await writeTmuxTeamRecord(resolvedRoot, { ...record, cleanup_completed_at: nowIso(), killed_session }).catch(() => null);
  return {
    ok: true,
    mission_id: record.mission_id,
    session: record.session,
    attach_command: record.attach_command,
    close_session: Boolean(closeSession),
    killed_session,
    dynamic_cleanup: dynamicCleanup,
    recorded_cleanup: recordedCleanup,
    legacy_cleanup: legacyCleanup,
    requested_close_surfaces: closeSession ? 1 : (dynamicCleanup?.closed_lane_count || recordedCleanup?.closed_lane_count || legacyCleanup?.requested_close_surfaces || 0),
    closed_surfaces: killed_session ? 1 : (dynamicCleanup?.closed_lane_count || recordedCleanup?.closed_lane_count || legacyCleanup?.closed_lane_count || 0),
    reason: dynamicCleanup?.ok
      ? 'cleanup closed managed Team panes in the current SKS tmux session.'
      : recordedCleanup?.ok
        ? 'cleanup closed recorded managed Team panes by stored tmux pane ids.'
        : legacyCleanup?.ok
          ? legacyCleanup.reason
      : closeSession
        ? 'tmux kill-session requested for recorded Team session.'
        : 'cleanup marks the SKS tmux Team record complete; no managed panes were reachable.'
  };
}

async function cleanupLegacyTmuxTeamSurfaces(root, missionId, opts = {}) {
  const id = String(missionId || '').trim();
  const tmuxBin = await findTmuxBin() || 'tmux';
  const current = await currentTmuxTarget(tmuxBin).catch(() => ({ ok: false }));
  const closed = [];
  const failed = [];
  let killed_session = false;
  let session_kill_requested = false;
  const session = id && id !== 'latest' ? sanitizeTmuxSessionName(`sks-team-${id}`) : '';
  if (session && await hasTmuxSession(tmuxBin, session)) {
    if (current.ok && current.session === session) {
      const panes = await listTmuxWindowPanes(tmuxBin, current.window_id);
      if (panes.ok) {
        for (const pane of panes.panes.filter((entry) => entry.pane_id !== current.pane_id && isLegacyTeamPane(entry))) {
          const kill = await tmuxRun(tmuxBin, ['kill-pane', '-t', pane.pane_id], { timeoutMs: 5000 });
          if (kill.code === 0) closed.push({ pane_id: pane.pane_id, title: pane.title });
          else failed.push({ pane_id: pane.pane_id, title: pane.title, stderr: kill.stderr || kill.stdout || 'tmux kill-pane failed' });
        }
      }
    } else {
      session_kill_requested = true;
      const kill = await tmuxRun(tmuxBin, ['kill-session', '-t', session], { timeoutMs: 5000 });
      killed_session = kill.code === 0;
      if (!killed_session) failed.push({ session, stderr: kill.stderr || kill.stdout || 'tmux kill-session failed' });
    }
  }
  if (current.ok) {
    const panes = await listTmuxWindowPanes(tmuxBin, current.window_id);
    if (panes.ok) {
      for (const pane of panes.panes.filter((entry) => !entry.managed && entry.pane_id !== current.pane_id && isLegacyTeamPane(entry))) {
        if (closed.some((entry) => entry.pane_id === pane.pane_id)) continue;
        const kill = await tmuxRun(tmuxBin, ['kill-pane', '-t', pane.pane_id], { timeoutMs: 5000 });
        if (kill.code === 0) closed.push({ pane_id: pane.pane_id, title: pane.title });
        else failed.push({ pane_id: pane.pane_id, title: pane.title, stderr: kill.stderr || kill.stdout || 'tmux kill-pane failed' });
      }
      if (closed.length) {
        await tmuxRun(tmuxBin, ['select-layout', '-t', current.window_id, DYNAMIC_TEAM_TMUX_LAYOUT], { timeoutMs: 5000 }).catch(() => null);
        await tmuxRun(tmuxBin, ['select-layout', '-t', current.window_id, '-E'], { timeoutMs: 5000 }).catch(() => null);
      }
    }
  }
  return {
    ok: failed.length === 0,
    skipped: !killed_session && closed.length === 0,
    session: session || null,
    killed_session,
    closed_lane_count: closed.length,
    requested_close_surfaces: (session_kill_requested ? 1 : 0) + closed.length,
    closed,
    failed,
    reason: killed_session
      ? 'cleanup closed legacy Team tmux session by mission id.'
      : closed.length
        ? 'cleanup closed legacy Team panes by lane title.'
        : 'cleanup found no legacy Team panes for this mission.'
  };
}

async function cleanupRecordedTmuxTeamPanes(root, missionId, record = {}) {
  const id = record.mission_id || missionId;
  const cockpitState = await readJson(tmuxCockpitStatePath(root), {}).catch(() => ({}));
  const cockpit = cockpitState?.missions?.[id] || {};
  const target = cockpit.window_id || record.window_id || cockpit.session || record.session;
  if (!target) return { ok: false, skipped: true, reason: 'no recorded tmux target', closed_lane_count: 0 };
  const tmuxBin = await findTmuxBin() || 'tmux';
  const paneList = await listTmuxWindowPanes(tmuxBin, target);
  if (!paneList.ok) return { ok: false, skipped: true, reason: paneList.stderr, closed_lane_count: 0 };
  const recordedPaneIds = new Set([
    ...(Array.isArray(record.panes) ? record.panes : []),
    ...(Array.isArray(cockpit.panes) ? cockpit.panes : [])
  ].map((pane) => pane?.pane_id).filter(Boolean));
  const managed = paneList.panes.filter((pane) => pane.managed && pane.mission_id === id);
  const recorded = paneList.panes.filter((pane) => recordedPaneIds.has(pane.pane_id));
  const targets = managed.length ? managed : recorded;
  const closed = [];
  const failed = [];
  for (const pane of targets) {
    const kill = await tmuxRun(tmuxBin, ['kill-pane', '-t', pane.pane_id], { timeoutMs: 5000 });
    if (kill.code === 0) closed.push({ pane_id: pane.pane_id, agent: pane.agent, role: pane.role });
    else failed.push({ pane_id: pane.pane_id, agent: pane.agent, stderr: kill.stderr || kill.stdout || 'tmux kill-pane failed' });
  }
  if (closed.length) {
    await tmuxRun(tmuxBin, ['select-layout', '-t', target, DYNAMIC_TEAM_TMUX_LAYOUT], { timeoutMs: 5000 }).catch(() => null);
    await tmuxRun(tmuxBin, ['select-layout', '-t', target, '-E'], { timeoutMs: 5000 }).catch(() => null);
  }
  return {
    ok: failed.length === 0,
    skipped: false,
    session: cockpit.session || record.session,
    window_id: cockpit.window_id || record.window_id || null,
    closed_lane_count: closed.length,
    fallback_used: !managed.length && recorded.length > 0,
    closed,
    failed,
    reason: closed.length
      ? (managed.length ? 'closed recorded managed panes' : 'closed panes by recorded SKS pane ids')
      : 'no recorded managed panes found'
  };
}

export async function runTmuxStatus(args = [], opts = {}) {
  const once = args.includes('--once') || !args.includes('--watch');
  do {
    const app = await codexAppIntegrationStatus();
    console.clear();
    console.log(formatTmuxBanner(app));
    if (once) return app;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  } while (true);
}

function readOption(args, name, fallback = null) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
