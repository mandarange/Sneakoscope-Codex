import path from 'node:path';
import fsp from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { exists, nowIso, packageRoot, readJson, runProcess, sha256, sksRoot, which, writeJsonAtomic } from './fsx.mjs';
import { getCodexInfo } from './codex-adapter.mjs';
import { codexAppIntegrationStatus, formatCodexAppStatus } from './codex-app.mjs';

export const SKS_CMUX_LOGO = [
  '   _____ __ __ _____',
  '  / ___// //_// ___/',
  '  \\__ \\/ ,<   \\__ \\   ㅅㅋㅅ',
  ' ___/ / /| | ___/ /',
  '/____/_/ |_|/____/',
  'Sneakoscope Codex cmux'
].join('\n');

export const CMUX_BREW_COMMAND = 'brew tap manaflow-ai/cmux && brew install --cask cmux';
export const CMUX_BREW_UPGRADE_COMMAND = 'brew tap manaflow-ai/cmux && brew upgrade --cask cmux';

export function sanitizeCmuxWorkspaceName(input) {
  const base = String(input || 'sks').trim().replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '');
  return (base || 'sks').slice(0, 80);
}

export function defaultCmuxWorkspaceName(root) {
  const base = sanitizeCmuxWorkspaceName(path.basename(root || process.cwd()) || 'project');
  const hash = sha256(path.resolve(root || process.cwd())).slice(0, 8);
  return sanitizeCmuxWorkspaceName(`sks-${base}-${hash}`);
}

export function cmuxWorkspaceDescription(plan = {}) {
  const profile = codexProfileFromArgs(plan.codexArgs);
  return [
    'managed-by=sneakoscope',
    `workspace=${sanitizeCmuxWorkspaceName(plan.workspace || defaultCmuxWorkspaceName(plan.root))}`,
    `root=${path.resolve(plan.root || process.cwd())}`,
    `profile=${profile || 'default'}`
  ].join('; ');
}

export function buildCmuxNewWorkspaceArgs(plan = {}, command = '') {
  return [
    'new-workspace',
    '--name', sanitizeCmuxWorkspaceName(plan.workspace || defaultCmuxWorkspaceName(plan.root)),
    '--description', cmuxWorkspaceDescription(plan),
    '--cwd', path.resolve(plan.root || process.cwd()),
    '--command', command
  ];
}

export function parseCmuxWorkspaceList(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  try {
    return normalizeWorkspacePayload(JSON.parse(raw));
  } catch {}
  return raw.split('\n').map(parseWorkspaceLine).filter(Boolean);
}

export function matchingCmuxWorkspaces(workspaces = [], plan = {}) {
  const targetName = sanitizeCmuxWorkspaceName(plan.workspace || defaultCmuxWorkspaceName(plan.root));
  const root = path.resolve(plan.root || process.cwd());
  return workspaces.filter((workspace) => {
    const name = workspaceName(workspace);
    const description = workspaceDescription(workspace);
    const cwd = workspaceCwd(workspace);
    if (name !== targetName && !description.includes(`workspace=${targetName}`)) return false;
    if (!cwd && !description.includes(`root=${root}`)) return true;
    return path.resolve(cwd || root) === root || description.includes(`root=${root}`);
  });
}

export function cmuxWorkspaceRef(workspace = {}) {
  return String(workspace.ref || workspace.workspace_ref || workspace.handle || workspace.id || workspace.workspace_id || workspace.uuid || '').trim();
}

export function cmuxWorkspaceRefFromText(text = '') {
  return String(text || '').match(/\bworkspace:\d+\b/i)?.[0] || String(text || '').match(/[0-9a-f]{8}-[0-9a-f-]{27,}/i)?.[0] || '';
}

export function cmuxSurfaceRefFromText(text = '') {
  return String(text || '').match(/\bsurface:\d+\b/i)?.[0] || '';
}

export function cmuxPaneRefFromText(text = '') {
  return String(text || '').match(/\bpane:\d+\b/i)?.[0] || '';
}

export function cmuxWorkspaceStatePath(plan = {}) {
  return path.join(path.resolve(plan.root || process.cwd()), '.sneakoscope', 'state', 'cmux-workspaces.json');
}

export function cmuxTeamStatePath(root = process.cwd()) {
  return path.join(path.resolve(root || process.cwd()), '.sneakoscope', 'state', 'cmux-team-workspaces.json');
}

export function cmuxWorkspaceStateKey(plan = {}) {
  const root = path.resolve(plan.root || process.cwd());
  const workspace = sanitizeCmuxWorkspaceName(plan.workspace || defaultCmuxWorkspaceName(root));
  const profile = codexProfileFromArgs(plan.codexArgs);
  return sha256(`${root}\n${workspace}\n${profile || 'default'}`).slice(0, 16);
}

export async function readCmuxWorkspaceRecord(plan = {}) {
  const state = await readJson(cmuxWorkspaceStatePath(plan), {}).catch(() => ({}));
  const record = state.workspaces?.[cmuxWorkspaceStateKey(plan)] || null;
  return record && typeof record === 'object' ? record : null;
}

export async function writeCmuxWorkspaceRecord(plan = {}, workspace = {}) {
  const statePath = cmuxWorkspaceStatePath(plan);
  const state = await readJson(statePath, {}).catch(() => ({}));
  const root = path.resolve(plan.root || process.cwd());
  const name = workspaceName(workspace) || sanitizeCmuxWorkspaceName(plan.workspace || defaultCmuxWorkspaceName(root));
  const record = {
    workspace: name,
    root,
    ref: cmuxWorkspaceRef(workspace),
    description: workspaceDescription(workspace) || cmuxWorkspaceDescription(plan),
    cwd: workspaceCwd(workspace) || root,
    profile: codexProfileFromArgs(plan.codexArgs) || 'default',
    updated_at: nowIso()
  };
  if (!record.ref) return null;
  const next = {
    schema_version: 1,
    updated_at: record.updated_at,
    workspaces: {
      ...(state.workspaces && typeof state.workspaces === 'object' ? state.workspaces : {}),
      [cmuxWorkspaceStateKey(plan)]: record
    }
  };
  await writeJsonAtomic(statePath, next);
  return record;
}

async function forgetCmuxWorkspaceRecord(plan = {}) {
  const statePath = cmuxWorkspaceStatePath(plan);
  const state = await readJson(statePath, null).catch(() => null);
  if (!state?.workspaces || typeof state.workspaces !== 'object') return;
  const key = cmuxWorkspaceStateKey(plan);
  if (!(key in state.workspaces)) return;
  delete state.workspaces[key];
  await writeJsonAtomic(statePath, { ...state, updated_at: nowIso(), workspaces: state.workspaces });
}

export function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export function platformCmuxInstallHint() {
  if (process.platform !== 'darwin') return 'cmux is a native macOS app; install it on macOS 14+ from https://cmux.com or https://github.com/manaflow-ai/cmux.';
  return [
    CMUX_BREW_COMMAND,
    'then run:',
    'sks cmux check'
  ].join(' ');
}

export async function findCmuxBinary() {
  const env = process.env.SKS_CMUX_BIN || process.env.CMUX_BIN;
  if (env && await exists(env)) return env;
  const onPath = await which('cmux').catch(() => null);
  if (onPath) return onPath;
  for (const candidate of cmuxBinaryCandidates()) {
    if (await exists(candidate)) return candidate;
  }
  return null;
}

export function cmuxBinaryCandidates() {
  if (process.platform !== 'darwin') return [];
  const envApps = String(process.env.SKS_CMUX_APP_PATHS || '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const appBundles = [
    ...envApps,
    '/Applications/cmux.app',
    '/Applications/Cmux.app',
    '/Applications/CMUX.app',
    path.join(process.env.HOME || '', 'Applications', 'cmux.app'),
    '/opt/homebrew/Caskroom/cmux/latest/cmux.app'
  ].filter(Boolean);
  const candidates = [];
  for (const app of appBundles) {
    candidates.push(
      path.join(app, 'Contents', 'Resources', 'bin', 'cmux'),
      path.join(app, 'Contents', 'MacOS', 'cmux')
    );
  }
  candidates.push('/opt/homebrew/bin/cmux', '/usr/local/bin/cmux');
  return Array.from(new Set(candidates));
}

function cmuxAppExecutableCandidates() {
  if (process.platform !== 'darwin') return [];
  const envApps = String(process.env.SKS_CMUX_APP_PATHS || '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const appBundles = [
    ...envApps,
    '/Applications/cmux.app',
    '/Applications/Cmux.app',
    '/Applications/CMUX.app',
    path.join(process.env.HOME || '', 'Applications', 'cmux.app'),
    '/opt/homebrew/Caskroom/cmux/latest/cmux.app'
  ].filter(Boolean);
  return Array.from(new Set(appBundles.map((app) => path.join(app, 'Contents', 'MacOS', 'cmux'))));
}

export async function cmuxAvailable() {
  const bin = await findCmuxBinary();
  if (!bin) return { ok: false, bin: null, version: null, executable_ok: false, error: 'cmux CLI not found' };
  const probe = await runProcess(bin, ['version'], { timeoutMs: 5000, maxOutputBytes: 16 * 1024 }).catch((err) => ({ code: 1, stderr: err.message, stdout: '' }));
  const text = `${probe.stdout || ''}${probe.stderr || ''}`.trim();
  return { ok: probe.code === 0, bin, version: text || 'cmux CLI', executable_ok: probe.code === 0, error: probe.code === 0 ? null : text || 'cmux CLI probe failed' };
}

export async function cmuxReadiness(opts = {}) {
  const available = opts.available || await cmuxAvailable();
  if (!available.ok) return { ...available, socket_ok: false };
  if (opts.checkSocket === false) return { ...available, ok: true, socket_ok: null };
  const socket = opts.wake ? await ensureCmuxDaemonReady(available) : await cmuxSocketProbe(available.bin);
  if (socket.ok) return { ...available, ok: true, socket_ok: true, error: null };
  return {
    ...available,
    ok: false,
    socket_ok: false,
    error: socket.error || 'cmux app/socket probe failed'
  };
}

export function cmuxStatusKind(cmux = {}) {
  if (cmux.ok) return 'ok';
  if (cmux.bin) return 'unhealthy';
  return 'missing';
}

export async function ensureCmuxInstalled(opts = {}) {
  const before = await cmuxReadiness({ wake: true }).catch((err) => ({ ok: false, error: err.message || 'cmux probe failed' }));
  if (before.ok) return { target: 'cmux', status: 'present', cmux: before, command: null };
  if (before.bin && before.executable_ok && before.socket_ok === false) {
    return { target: 'cmux', status: 'unhealthy', cmux: before, command: 'sks cmux check', error: before.error || 'cmux app/socket unhealthy' };
  }
  if (opts.autoInstall === false || process.env.SKS_NO_CMUX_AUTO_INSTALL === '1') {
    return { target: 'cmux', status: before.bin ? 'unhealthy' : 'missing', cmux: before, command: before.bin ? 'sks cmux check' : CMUX_BREW_COMMAND, error: before.error || 'cmux CLI not found' };
  }
  if (process.platform !== 'darwin') {
    return { target: 'cmux', status: 'manual_required', cmux: before, command: platformCmuxInstallHint(), error: before.error || 'cmux is macOS-only' };
  }
  const brew = await which('brew').catch(() => null);
  if (!brew) {
    return { target: 'cmux', status: 'homebrew_missing', cmux: before, command: CMUX_BREW_COMMAND, error: 'Homebrew is required for automatic cmux install' };
  }
  if (!opts.quiet) console.log('cmux CLI missing; installing/updating cmux with Homebrew...');
  const tap = await runProcess(brew, ['tap', 'manaflow-ai/cmux'], { timeoutMs: 180000, maxOutputBytes: 128 * 1024 }).catch((err) => ({ code: 1, stdout: '', stderr: err.message }));
  const install = tap.code === 0
    ? await installOrUpgradeCmuxCask(brew)
    : tap;
  const after = await cmuxReadiness({ wake: true }).catch((err) => ({ ok: false, error: err.message || 'cmux probe failed after install' }));
  if (after.ok) return { target: 'cmux', status: 'installed', cmux: after, command: CMUX_BREW_COMMAND };
  const installText = `${install.stderr || ''}\n${install.stdout || ''}`.trim();
  const rawError = after.error || installText || 'brew install --cask cmux completed, but no working cmux CLI was found';
  return { target: 'cmux', status: 'failed', cmux: after, command: CMUX_BREW_COMMAND, code: install.code, error: rawError };
}

async function installOrUpgradeCmuxCask(brew) {
  const install = await runProcess(brew, ['install', '--cask', 'cmux'], { timeoutMs: 300000, maxOutputBytes: 256 * 1024 }).catch((err) => ({ code: 1, stdout: '', stderr: err.message }));
  if (install.code === 0) return install;
  const text = `${install.stderr || ''}\n${install.stdout || ''}`;
  if (!/already installed|to upgrade|brew upgrade/i.test(text)) return install;
  const upgrade = await runProcess(brew, ['upgrade', '--cask', 'cmux'], { timeoutMs: 300000, maxOutputBytes: 256 * 1024 }).catch((err) => ({ code: 1, stdout: '', stderr: err.message }));
  return upgrade.code === 0 ? upgrade : install;
}

export function codexLaunchCommand(root, codexBin, codexArgs = []) {
  const extraArgs = Array.isArray(codexArgs) ? codexArgs : [];
  return [
    'clear',
    `printf '%s\\n' ${shellEscape(SKS_CMUX_LOGO)}`,
    `printf '\\nProject: %s\\n' ${shellEscape(root)}`,
    'printf \'Runtime: cmux workspace for Codex CLI\\n\'',
    'printf \'Prompt:  use canonical $ commands, for example $Team or $QA-LOOP\\n\\n\'',
    'sleep 1',
    `exec ${[shellEscape(codexBin), ...extraArgs.map(shellEscape), '--cd', shellEscape(root)].join(' ')}`
  ].join('; ');
}

function echoLinesCommand(lines = []) {
  return lines.map((line) => String(line) ? `echo ${shellEscape(line)}` : 'echo').join('; ');
}

export const CMUX_TEAM_LANE_STYLES = Object.freeze({
  overview: Object.freeze({ role: 'overview', label: 'overview', color_name: 'Charcoal', color: '#3E4B5E', icon: 'layout-dashboard' }),
  scout: Object.freeze({ role: 'scout', label: 'scout', color_name: 'Aqua', color: '#0E6B8C', icon: 'search' }),
  planning: Object.freeze({ role: 'planning', label: 'plan', color_name: 'Amber', color: '#7D6608', icon: 'messages-square' }),
  execution: Object.freeze({ role: 'execution', label: 'exec', color_name: 'Green', color: '#196F3D', icon: 'hammer' }),
  review: Object.freeze({ role: 'review', label: 'review', color_name: 'Crimson', color: '#922B21', icon: 'shield-check' }),
  safety: Object.freeze({ role: 'safety', label: 'safety', color_name: 'Magenta', color: '#AD1457', icon: 'database' })
});

export function teamLaneStyle(agentId = '') {
  const id = String(agentId || '').toLowerCase();
  if (!id || id === 'mission_overview' || id === 'overview') return CMUX_TEAM_LANE_STYLES.overview;
  if (/analysis|scout/.test(id)) return CMUX_TEAM_LANE_STYLES.scout;
  if (/debate|consensus|planner|user/.test(id)) return CMUX_TEAM_LANE_STYLES.planning;
  if (/db|safety/.test(id)) return CMUX_TEAM_LANE_STYLES.safety;
  if (/review|qa|validation/.test(id)) return CMUX_TEAM_LANE_STYLES.review;
  if (/executor|implementation|worker|developer/.test(id)) return CMUX_TEAM_LANE_STYLES.execution;
  return CMUX_TEAM_LANE_STYLES.planning;
}

function teamLaneTitle(agentId = '') {
  const style = teamLaneStyle(agentId);
  return `${style.label}: ${String(agentId || 'mission_overview')}`.slice(0, 80);
}

function cmuxStatusKey(agentId = '') {
  return sanitizeCmuxWorkspaceName(`sks-${String(agentId || 'overview').toLowerCase()}`).slice(0, 40);
}

export function teamAgentCommand(root, missionId, agentId, phase) {
  const style = teamLaneStyle(agentId);
  return [
    'clear',
    echoLinesCommand([...SKS_CMUX_LOGO.split('\n'), '', `Team mission: ${missionId}`, `Agent: ${agentId}`, `Lane: ${style.label} (${style.color_name} ${style.color})`, `Phase: ${phase}`, '']),
    `cd ${shellEscape(root)}`,
    `node ${shellEscape(path.join(packageRoot(), 'bin', 'sks.mjs'))} team lane ${shellEscape(missionId)} --agent ${shellEscape(agentId)} --phase ${shellEscape(phase)} --follow --lines 12`
  ].join('; ');
}

export function teamOverviewCommand(root, missionId) {
  const style = teamLaneStyle('mission_overview');
  return [
    'clear',
    echoLinesCommand([...SKS_CMUX_LOGO.split('\n'), '', `Team mission: ${missionId}`, 'View: live orchestration overview', `Lane: ${style.label} (${style.color_name} ${style.color})`, '']),
    `cd ${shellEscape(root)}`,
    `node ${shellEscape(path.join(packageRoot(), 'bin', 'sks.mjs'))} team watch ${shellEscape(missionId)} --follow --lines 18`
  ].join('; ');
}

export async function buildCmuxLaunchPlan(opts = {}) {
  const root = path.resolve(opts.root || await sksRoot());
  const workspace = sanitizeCmuxWorkspaceName(opts.workspace || opts.session || defaultCmuxWorkspaceName(root));
  const sksBin = opts.sksBin || path.join(packageRoot(), 'bin', 'sks.mjs');
  const codex = opts.codex || await getCodexInfo().catch(() => ({}));
  const cmux = opts.cmux || await cmuxReadiness({ wake: opts.wakeCmux === true });
  const app = opts.app || await codexAppIntegrationStatus({ codex });
  const codexArgs = Array.isArray(opts.codexArgs) ? opts.codexArgs : [];
  return {
    root,
    workspace,
    sksBin,
    codex,
    cmux,
    app,
    codexArgs,
    ready: Boolean(cmux.ok && codex.bin),
    warnings: app.ok ? [] : app.guidance || [],
    blockers: [
      ...(!cmux.ok ? [cmux.bin ? `cmux app/socket unhealthy: ${cmux.error || 'run sks cmux check'}` : `cmux missing. Install: ${platformCmuxInstallHint()}`] : []),
      ...(!codex.bin ? ['Codex CLI missing. Install: npm i -g @openai/codex, or set SKS_CODEX_BIN.'] : [])
    ]
  };
}

export function formatCmuxBanner(status = null) {
  const lines = [
    SKS_CMUX_LOGO,
    '',
    'ㅅㅋㅅ cmux runtime',
    '',
    'Canonical prompt commands:',
    '  $DFix  $Answer  $SKS  $Team  $QA-LOOP  $Goal  $Research  $AutoResearch  $DB  $GX  $Wiki  $Help',
    '',
    'CLI-first runtime:',
    '  sks                 open a cmux Codex CLI workspace',
    '  sks --mad           open one-shot MAD full-access auto-review workspace',
    '  sks team "task"     prepare Team mission and cmux multi-line agent view',
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

export async function launchCmuxUi(args = [], opts = {}) {
  const rootArg = readOption(args, '--root', opts.root);
  const workspaceArg = readOption(args, '--workspace', readOption(args, '--session', opts.workspace || opts.session));
  let plan = await buildCmuxLaunchPlan({ ...opts, root: rootArg, workspace: workspaceArg });
  let cmuxRepair = null;
  if (!plan.ready && plan.cmux.bin && !plan.cmux.ok && !args.includes('--json')) {
    const warmed = await wakeCmuxAndReprobe(plan.cmux);
    if (warmed.ok) plan = await buildCmuxLaunchPlan({ ...opts, root: rootArg, workspace: workspaceArg, cmux: warmed });
  }
  if (!plan.ready && !plan.cmux.ok && opts.autoInstallCmux && !args.includes('--json')) {
    cmuxRepair = await ensureCmuxInstalled({ autoInstall: true, quiet: Boolean(opts.quietAutoInstall || args.includes('--quiet')) });
    if (cmuxRepair.cmux?.ok) plan = await buildCmuxLaunchPlan({ ...opts, root: rootArg, workspace: workspaceArg, cmux: cmuxRepair.cmux });
  }
  if (args.includes('--json')) return { plan };
  if (!plan.ready && !args.includes('--status-only')) {
    printCmuxLaunchBlocked(plan, { concise: opts.conciseBlockers, cmuxRepair });
    process.exitCode = 1;
    return { plan };
  }
  const daemon = await ensureCmuxDaemonReady(plan.cmux);
  if (!daemon.ok && !args.includes('--status-only')) {
    const blocked = { ...plan, ready: false, cmux: { ...plan.cmux, ok: false, error: daemon.error || 'cmux app did not become ready' } };
    printCmuxLaunchBlocked(blocked, { concise: opts.conciseBlockers, cmuxRepair });
    process.exitCode = 1;
    return { plan: blocked };
  }
  if (args.includes('--status-only')) return { plan };
  if (!args.includes('--no-open')) await openCmuxApp().catch(() => null);
  const command = codexLaunchCommand(plan.root, plan.codex.bin, plan.codexArgs);
  if (!args.includes('--status-only')) {
    const reuse = await reuseExistingCmuxWorkspace(plan, { cleanup: opts.cleanupWorkspaces !== false });
    if (reuse.reused) {
      if (!args.includes('--quiet')) {
        const suffix = reuse.closed_duplicates ? `; closed duplicate workspace(s): ${reuse.closed_duplicates}` : '';
        console.log(`SKS cmux workspace reused: ${plan.workspace}${suffix}`);
      }
      return { plan, created: false, reused: true, workspace: reuse.workspace, cleanup: reuse };
    }
    if (!reuse.ok) {
      process.exitCode = 1;
      console.error(`SKS cmux workspace check failed: ${reuse.error}`);
      return { plan, workspace_reuse: reuse };
    }
  }
  const created = spawnSync(plan.cmux.bin, buildCmuxNewWorkspaceArgs(plan, command), { encoding: 'utf8', stdio: 'pipe' });
  if (!args.includes('--quiet')) {
    if (created.stdout) process.stdout.write(created.stdout);
    if (created.stderr) process.stderr.write(created.stderr);
  }
  if (created.status !== 0) {
    process.exitCode = created.status || 1;
    if (args.includes('--quiet') && created.stderr) process.stderr.write(created.stderr);
    return { plan };
  }
  const createdRef = cmuxWorkspaceRefFromText(`${created.stdout || ''}\n${created.stderr || ''}`);
  if (createdRef) {
    await writeCmuxWorkspaceRecord(plan, { ref: createdRef, name: plan.workspace, description: cmuxWorkspaceDescription(plan), cwd: plan.root }).catch(() => null);
    await runProcess(plan.cmux.bin, ['select-workspace', '--workspace', createdRef], { timeoutMs: 5000, maxOutputBytes: 16 * 1024 }).catch(() => null);
  }
  if (args.includes('--no-open')) {
    console.log(`SKS cmux workspace requested: ${plan.workspace}`);
  }
  return { plan, created: true };
}

async function reuseExistingCmuxWorkspace(plan = {}, opts = {}) {
  const remembered = await reuseRecordedCmuxWorkspace(plan);
  if (remembered.reused) return remembered;
  const listed = await listCmuxWorkspaces(plan.cmux?.bin);
  if (!listed.ok) return listed;
  const matches = matchingCmuxWorkspaces(listed.workspaces, plan);
  if (!matches.length) return { ok: true, reused: false, closed_duplicates: 0 };
  const [keep, ...duplicates] = matches;
  const ref = cmuxWorkspaceRef(keep);
  if (!ref) return { ok: false, error: 'matching cmux workspace has no usable id/ref' };
  const selected = await runProcess(plan.cmux.bin, ['select-workspace', '--workspace', ref], { timeoutMs: 5000, maxOutputBytes: 16 * 1024 }).catch((err) => ({ code: 1, stdout: '', stderr: err.message }));
  if (selected.code !== 0) return { ok: false, error: `${selected.stderr || selected.stdout || 'cmux select-workspace failed'}`.trim() };
  let closed = 0;
  if (opts.cleanup !== false) {
    for (const duplicate of duplicates) {
      const duplicateRef = cmuxWorkspaceRef(duplicate);
      if (!duplicateRef || duplicateRef === ref) continue;
      const close = await runProcess(plan.cmux.bin, ['close-workspace', '--workspace', duplicateRef], { timeoutMs: 5000, maxOutputBytes: 16 * 1024 }).catch((err) => ({ code: 1, stdout: '', stderr: err.message }));
      if (close.code === 0) closed += 1;
    }
  }
  await writeCmuxWorkspaceRecord(plan, keep).catch(() => null);
  return { ok: true, reused: true, workspace: keep, workspace_ref: ref, closed_duplicates: closed, total_matches: matches.length };
}

async function reuseRecordedCmuxWorkspace(plan = {}) {
  const record = await readCmuxWorkspaceRecord(plan);
  const ref = cmuxWorkspaceRef(record || {});
  if (!ref) return { ok: true, reused: false };
  const selected = await runProcess(plan.cmux.bin, ['select-workspace', '--workspace', ref], { timeoutMs: 5000, maxOutputBytes: 16 * 1024 }).catch((err) => ({ code: 1, stdout: '', stderr: err.message }));
  if (selected.code === 0) return { ok: true, reused: true, workspace: record, workspace_ref: ref, remembered: true, closed_duplicates: 0 };
  const error = `${selected.stderr || selected.stdout || 'cmux select-workspace failed'}`.trim();
  if (isRecoverableCmuxSocketError(error)) return { ok: false, error, stale_ref: ref };
  await forgetCmuxWorkspaceRecord(plan).catch(() => null);
  return { ok: true, reused: false, stale_ref: ref, stale_error: error };
}

async function listCmuxWorkspaces(bin) {
  if (!bin) return { ok: false, error: 'cmux CLI not found' };
  const run = await runProcess(bin, ['list-workspaces', '--json'], { timeoutMs: 5000, maxOutputBytes: 128 * 1024 }).catch((err) => ({ code: 1, stdout: '', stderr: err.message }));
  if (run.code !== 0) return { ok: false, error: `${run.stderr || run.stdout || 'cmux list-workspaces failed'}`.trim() };
  return { ok: true, workspaces: parseCmuxWorkspaceList(run.stdout || run.stderr || '') };
}

function printCmuxLaunchBlocked(plan, opts = {}) {
  if (opts.concise) {
    console.error('SKS cmux launch blocked.');
    if (!plan.cmux.ok) {
      const repair = opts.cmuxRepair;
      const installedButUnhealthy = Boolean(plan.cmux.bin);
      const prefix = repair?.status
        ? `cmux ${repair.status}`
        : installedButUnhealthy
          ? 'cmux app/socket unhealthy'
          : 'cmux missing';
      console.error(`- ${prefix}: ${repair?.error || plan.cmux.error || 'cmux CLI not found'}`);
      console.error(`- ${installedButUnhealthy ? 'Repair command' : 'Install command'}: ${repair?.command || (installedButUnhealthy ? 'sks deps install cmux --yes' : CMUX_BREW_COMMAND)}`);
    }
    if (!plan.codex.bin) console.error('- Codex CLI missing. Install: npm i -g @openai/codex@latest, or set SKS_CODEX_BIN.');
    return;
  }
  console.log(formatCmuxBanner(plan.app));
  console.log('\nLaunch blocked:\n');
  for (const blocker of Array.from(new Set(plan.blockers))) console.log(`- ${blocker}`);
}

export async function openCmuxApp() {
  if (process.platform !== 'darwin') return { ok: false, reason: 'not_macos' };
  const run = await runProcess('open', ['-a', 'cmux'], { timeoutMs: 5000, maxOutputBytes: 16 * 1024 }).catch((err) => ({ code: 1, stderr: err.message, stdout: '' }));
  if (run.code === 0) return { ok: true, stdout: run.stdout || '', stderr: run.stderr || '' };
  for (const app of ['/Applications/cmux.app', '/Applications/Cmux.app']) {
    if (!await exists(app)) continue;
    const byPath = await runProcess('open', [app], { timeoutMs: 5000, maxOutputBytes: 16 * 1024 }).catch((err) => ({ code: 1, stderr: err.message, stdout: '' }));
    if (byPath.code === 0) return { ok: true, stdout: byPath.stdout || '', stderr: byPath.stderr || '' };
  }
  return { ok: false, stdout: run.stdout || '', stderr: run.stderr || '' };
}

async function wakeCmuxAndReprobe(fallback = {}) {
  return ensureCmuxDaemonReady(fallback);
}

async function ensureCmuxDaemonReady(cmux = {}) {
  if (!cmux?.bin) return { ok: false, error: cmux?.error || 'cmux CLI not found' };
  const first = await cmuxSocketProbe(cmux.bin);
  if (first.ok) return { ...cmux, ok: true, error: null };
  if (process.platform !== 'darwin') return first;
  const opened = await openCmuxApp().catch(() => null);
  if (!opened?.ok) return { ok: false, error: opened?.stderr || opened?.reason || first.error || 'cmux app launch failed' };
  let last = first;
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => setTimeout(resolve, 750));
    last = await cmuxSocketProbe(cmux.bin);
    if (last.ok) return { ...cmux, ok: true, error: null };
  }
  if (isRecoverableCmuxSocketError(last.error) && process.env.SKS_CMUX_NO_RESTART !== '1') {
    await restartCmuxApp();
    for (let i = 0; i < 8; i++) {
      await new Promise((resolve) => setTimeout(resolve, 750));
      last = await cmuxSocketProbe(cmux.bin);
      if (last.ok) return { ...cmux, ok: true, error: null };
    }
    if (process.env.SKS_CMUX_SOCKET_ALLOW_ALL !== '0') {
      await restartCmuxApp({ socketMode: 'allowAll' });
      for (let i = 0; i < 8; i++) {
        await new Promise((resolve) => setTimeout(resolve, 750));
        last = await cmuxSocketProbe(cmux.bin);
        if (last.ok) return { ...cmux, ok: true, error: null, socket_mode: 'allowAll' };
      }
    }
  }
  return { ok: false, error: last.error || 'cmux socket did not become ready' };
}

async function cmuxSocketProbe(bin) {
  const probe = await runProcess(bin, ['list-workspaces', '--json'], { timeoutMs: 5000, maxOutputBytes: 16 * 1024 }).catch((err) => ({ code: 1, stderr: err.message, stdout: '' }));
  const text = `${probe.stdout || ''}${probe.stderr || ''}`.trim();
  return { ok: probe.code === 0, error: probe.code === 0 ? null : text || 'cmux socket probe failed' };
}

function isRecoverableCmuxSocketError(error) {
  return /socket|broken pipe|receive timeout|connection refused/i.test(String(error || ''));
}

async function restartCmuxApp(opts = {}) {
  if (process.platform !== 'darwin') return { ok: false, reason: 'not_macos' };
  const quit = await runProcess('osascript', ['-e', 'tell application "cmux" to quit'], { timeoutMs: 8000, maxOutputBytes: 16 * 1024 }).catch((err) => ({ code: 1, stderr: err.message, stdout: '' }));
  if (quit.code !== 0) {
    await runProcess('pkill', ['-TERM', '-f', '/Applications/cmux.app/Contents/MacOS/cmux'], { timeoutMs: 8000, maxOutputBytes: 16 * 1024 }).catch(() => null);
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await removeStaleCmuxSocket().catch(() => null);
  if (opts.socketMode) return openCmuxAppWithSocketMode(opts.socketMode);
  return openCmuxApp();
}

async function openCmuxAppWithSocketMode(socketMode) {
  for (const exe of cmuxAppExecutableCandidates()) {
    if (!await exists(exe)) continue;
    const child = spawn(exe, [], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, CMUX_SOCKET_MODE: socketMode }
    });
    child.unref();
    return { ok: true, mode: socketMode, executable: exe };
  }
  return openCmuxApp();
}

async function removeStaleCmuxSocket() {
  const home = process.env.HOME;
  if (!home) return;
  const sock = path.join(home, 'Library', 'Application Support', 'cmux', 'cmux.sock');
  await fsp.rm(sock, { force: true });
}

export async function launchCmuxTeamView({ root, missionId, plan = {}, promptFile = null, json = false } = {}) {
  const launch = await buildCmuxLaunchPlan({ root, workspace: `sks-team-${missionId}`, wakeCmux: true });
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
  const result = { ready: launch.ready, cmux: launch.cmux, workspace: launch.workspace, overview, agents: commands, lanes, cleanup_policy: 'collapse-agent-lanes-to-overview', blockers: launch.blockers };
  if (json || !launch.ready) return result;
  const first = overview.command;
  const created = spawnSync(launch.cmux.bin, buildCmuxNewWorkspaceArgs(launch, first), { encoding: 'utf8', stdio: 'pipe' });
  result.created = created.status === 0;
  result.stdout = created.stdout || '';
  result.stderr = created.stderr || '';
  const createdText = `${created.stdout || ''}\n${created.stderr || ''}`;
  const workspaceRef = cmuxWorkspaceRefFromText(createdText);
  let overviewSurfaceRef = cmuxSurfaceRefFromText(createdText);
  if (workspaceRef) {
    overviewSurfaceRef ||= firstCmuxSurfaceRef(launch.cmux.bin, workspaceRef);
    result.workspace_ref = workspaceRef;
    if (overviewSurfaceRef) result.overview.surface_ref = overviewSurfaceRef;
    await writeCmuxWorkspaceRecord(launch, { ref: workspaceRef, name: launch.workspace, description: cmuxWorkspaceDescription(launch), cwd: launch.root }).catch(() => null);
    const selected = await runProcess(launch.cmux.bin, ['select-workspace', '--workspace', workspaceRef], { timeoutMs: 5000, maxOutputBytes: 16 * 1024 }).catch((err) => ({ code: 1, stdout: '', stderr: err.message }));
    result.selected = selected.code === 0;
    result.select_stdout = selected.stdout || '';
    result.select_stderr = selected.stderr || '';
  }
  result.splits = [];
  if (!result.created || !workspaceRef) {
    if (!workspaceRef) result.blockers = [...(result.blockers || []), 'cmux new-workspace did not return a workspace ref'];
    return result;
  }
  for (const entry of commands) {
    const split = spawnSync(launch.cmux.bin, ['new-split', 'right', '--workspace', workspaceRef], { encoding: 'utf8', stdio: 'pipe' });
    const splitText = `${split.stdout || ''}\n${split.stderr || ''}`;
    const surfaceRef = cmuxSurfaceRefFromText(splitText);
    const paneRef = cmuxPaneRefFromText(splitText);
    const splitResult = {
      agent: entry.agent,
      ok: split.status === 0 && Boolean(surfaceRef),
      pane_ref: paneRef,
      surface_ref: surfaceRef,
      style: entry.style,
      title: entry.title,
      stdout: split.stdout || '',
      stderr: split.stderr || ''
    };
    if (splitResult.ok) {
      const send = spawnSync(launch.cmux.bin, ['send', '--workspace', workspaceRef, '--surface', surfaceRef, `${entry.command}\n`], { encoding: 'utf8', stdio: 'pipe' });
      splitResult.send_ok = send.status === 0;
      splitResult.send_stdout = send.stdout || '';
      splitResult.send_stderr = send.stderr || '';
    }
    result.splits.push(splitResult);
  }
  const customizationLanes = [
    { ...overview, surface_ref: overviewSurfaceRef },
    ...result.splits.map((entry) => ({ agent: entry.agent, surface_ref: entry.surface_ref, pane_ref: entry.pane_ref, style: entry.style, title: entry.title }))
  ];
  result.customization = await applyCmuxTeamCustomization(launch.cmux.bin, workspaceRef, customizationLanes);
  await writeCmuxTeamRecord(launch.root, {
    mission_id: missionId,
    workspace: launch.workspace,
    workspace_ref: workspaceRef,
    overview_surface_ref: overviewSurfaceRef || null,
    cleanup_policy: result.cleanup_policy,
    lanes: customizationLanes.map((entry) => ({
      agent: entry.agent,
      role: entry.style?.role || teamLaneStyle(entry.agent).role,
      style: entry.style || teamLaneStyle(entry.agent),
      title: entry.title || teamLaneTitle(entry.agent),
      surface_ref: entry.surface_ref || null,
      pane_ref: entry.pane_ref || null
    }))
  }).catch(() => null);
  result.split_count = result.splits.filter((entry) => entry.ok && entry.send_ok).length;
  const expectedSplits = commands.length;
  result.opened_lane_count = 1 + result.split_count;
  result.all_lanes_opened = result.created && result.selected !== false && result.split_count === expectedSplits;
  result.screen_read_checks = readCmuxLaneScreens(launch.cmux.bin, workspaceRef, [
    { agent: 'mission_overview', surface_ref: overviewSurfaceRef },
    ...result.splits.map((entry) => ({ agent: entry.agent, surface_ref: entry.surface_ref }))
  ]);
  result.screen_read_ok = result.screen_read_checks.some((entry) => entry.ok);
  result.ready = Boolean(result.ready && result.all_lanes_opened);
  if (!result.all_lanes_opened) {
    result.blockers = [
      ...(result.blockers || []),
      ...(result.selected === false ? [`cmux workspace was created but could not be selected: ${result.select_stderr || result.select_stdout || 'select-workspace failed'}`] : []),
      ...(result.split_count !== expectedSplits ? [`cmux opened ${result.opened_lane_count}/${commands.length} requested Team lane(s)`] : [])
    ];
  }
  return result;
}

async function applyCmuxTeamCustomization(bin, workspaceRef, lanes = []) {
  if (!bin || !workspaceRef) return { ok: false, skipped: true, reason: 'missing cmux binary or workspace ref', operations: [] };
  const operations = [];
  const pushRun = async (label, args) => {
    const run = await runProcess(bin, args, { timeoutMs: 5000, maxOutputBytes: 16 * 1024 }).catch((err) => ({ code: 1, stdout: '', stderr: err.message }));
    operations.push({ label, args, ok: run.code === 0, stdout: run.stdout || '', stderr: run.stderr || '' });
    return run.code === 0;
  };
  const overview = lanes.find((lane) => (lane.agent || '') === 'mission_overview') || lanes[0] || {};
  const overviewStyle = overview.style || teamLaneStyle('mission_overview');
  await pushRun('workspace-color', ['workspace-action', '--workspace', workspaceRef, '--action', 'set-color', '--color', overviewStyle.color]);
  await pushRun('workspace-status', ['set-status', 'sks-team', 'Team live', '--icon', overviewStyle.icon, '--color', overviewStyle.color, '--workspace', workspaceRef]);
  await pushRun('workspace-progress', ['set-progress', '0.15', '--label', 'Team running', '--workspace', workspaceRef]);
  for (const lane of lanes) {
    const style = lane.style || teamLaneStyle(lane.agent);
    if (lane.surface_ref) await pushRun(`rename-${lane.agent}`, ['rename-tab', '--workspace', workspaceRef, '--surface', lane.surface_ref, '--title', lane.title || teamLaneTitle(lane.agent)]);
    await pushRun(`status-${lane.agent}`, ['set-status', cmuxStatusKey(lane.agent), lane.title || teamLaneTitle(lane.agent), '--icon', style.icon, '--color', style.color, '--workspace', workspaceRef]);
  }
  return { ok: operations.some((entry) => entry.ok), operations };
}

async function writeCmuxTeamRecord(root, record = {}) {
  if (!record.mission_id || !record.workspace_ref) return null;
  const statePath = cmuxTeamStatePath(root);
  const state = await readJson(statePath, {}).catch(() => ({}));
  const now = nowIso();
  const nextRecord = { ...record, schema_version: 1, root: path.resolve(root || process.cwd()), updated_at: now };
  const missions = state.missions && typeof state.missions === 'object' ? state.missions : {};
  await writeJsonAtomic(statePath, {
    schema_version: 1,
    updated_at: now,
    missions: {
      ...missions,
      [record.mission_id]: nextRecord
    }
  });
  return nextRecord;
}

async function readCmuxTeamRecord(root, missionId) {
  const state = await readJson(cmuxTeamStatePath(root), {}).catch(() => ({}));
  const missions = state.missions && typeof state.missions === 'object' ? state.missions : {};
  if (missionId && missionId !== 'latest') return missions[missionId] || null;
  const records = Object.values(missions).filter((entry) => entry && typeof entry === 'object');
  records.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  return records[0] || null;
}

export async function cleanupCmuxTeamView({ root, missionId = 'latest', closeWorkspace = false } = {}) {
  const resolvedRoot = path.resolve(root || await sksRoot());
  const record = await readCmuxTeamRecord(resolvedRoot, missionId);
  if (!record?.workspace_ref) return { ok: false, skipped: true, reason: 'no recorded cmux Team workspace', mission_id: missionId };
  const cmux = await cmuxReadiness({ wake: true }).catch((err) => ({ ok: false, error: err.message || 'cmux readiness failed' }));
  if (!cmux.ok) return { ok: false, workspace_ref: record.workspace_ref, mission_id: record.mission_id, reason: cmux.error || 'cmux not ready' };
  const operations = [];
  const run = async (label, args) => {
    const out = await runProcess(cmux.bin, args, { timeoutMs: 5000, maxOutputBytes: 16 * 1024 }).catch((err) => ({ code: 1, stdout: '', stderr: err.message }));
    operations.push({ label, ok: out.code === 0, stdout: out.stdout || '', stderr: out.stderr || '' });
    return out.code === 0;
  };
  if (closeWorkspace) {
    const closed = await run('close-workspace', ['close-workspace', '--workspace', record.workspace_ref]);
    return { ok: closed, mission_id: record.mission_id, workspace_ref: record.workspace_ref, close_workspace: true, closed_workspace: closed, operations };
  }
  let overviewSurfaceRef = record.overview_surface_ref || record.lanes?.find((lane) => lane.agent === 'mission_overview')?.surface_ref || null;
  let agentLanes = (record.lanes || []).filter((lane) => lane.surface_ref && lane.surface_ref !== overviewSurfaceRef && lane.agent !== 'mission_overview');
  if (!overviewSurfaceRef) {
    const agentRefs = new Set(agentLanes.map((lane) => lane.surface_ref));
    overviewSurfaceRef = listCmuxWorkspaceSurfacesSync(cmux.bin, record.workspace_ref).find((surfaceRef) => !agentRefs.has(surfaceRef)) || null;
    agentLanes = (record.lanes || []).filter((lane) => lane.surface_ref && lane.surface_ref !== overviewSurfaceRef && lane.agent !== 'mission_overview');
  }
  let closed = 0;
  for (const lane of agentLanes) {
    if (await run(`close-${lane.agent}`, ['close-surface', '--workspace', record.workspace_ref, '--surface', lane.surface_ref])) closed += 1;
  }
  const completeStyle = CMUX_TEAM_LANE_STYLES.execution;
  if (overviewSurfaceRef) await run('rename-overview-complete', ['rename-tab', '--workspace', record.workspace_ref, '--surface', overviewSurfaceRef, '--title', `complete: ${record.mission_id}`.slice(0, 80)]);
  await run('status-complete', ['set-status', 'sks-team', 'Team complete', '--icon', 'check-circle', '--color', completeStyle.color, '--workspace', record.workspace_ref]);
  await run('progress-complete', ['set-progress', '1.0', '--label', 'Team complete', '--workspace', record.workspace_ref]);
  await run('select-workspace', ['select-workspace', '--workspace', record.workspace_ref]);
  await writeCmuxTeamRecord(resolvedRoot, { ...record, cleanup_completed_at: nowIso(), closed_agent_surfaces: closed }).catch(() => null);
  return {
    ok: true,
    mission_id: record.mission_id,
    workspace_ref: record.workspace_ref,
    close_workspace: false,
    kept_surface: overviewSurfaceRef,
    requested_close_surfaces: agentLanes.length,
    closed_surfaces: closed,
    operations
  };
}

function readCmuxLaneScreens(bin, workspaceRef, lanes = []) {
  return lanes.map((lane) => {
    const args = ['read-screen', '--workspace', workspaceRef, '--lines', '6'];
    if (lane.surface_ref) args.splice(3, 0, '--surface', lane.surface_ref);
    const read = spawnSync(bin, args, { encoding: 'utf8', stdio: 'pipe' });
    const text = `${read.stdout || ''}\n${read.stderr || ''}`.trim();
    return {
      agent: lane.agent,
      surface_ref: lane.surface_ref || null,
      ok: read.status === 0 && Boolean(text),
      preview: text.slice(0, 1000),
      error: read.status === 0 ? null : text || 'cmux read-screen failed'
    };
  });
}

function firstCmuxSurfaceRef(bin, workspaceRef) {
  return listCmuxWorkspaceSurfacesSync(bin, workspaceRef)[0] || '';
}

function listCmuxWorkspaceSurfacesSync(bin, workspaceRef) {
  if (!bin || !workspaceRef) return [];
  const panes = spawnSync(bin, ['list-panes', '--workspace', workspaceRef], { encoding: 'utf8', stdio: 'pipe' });
  if (panes.status !== 0) return [];
  const paneRefs = Array.from(new Set(String(`${panes.stdout || ''}\n${panes.stderr || ''}`).match(/\bpane:\d+\b/g) || []));
  const surfaces = [];
  for (const paneRef of paneRefs) {
    const run = spawnSync(bin, ['list-pane-surfaces', '--workspace', workspaceRef, '--pane', paneRef], { encoding: 'utf8', stdio: 'pipe' });
    if (run.status !== 0) continue;
    for (const surfaceRef of String(`${run.stdout || ''}\n${run.stderr || ''}`).match(/\bsurface:\d+\b/g) || []) {
      if (!surfaces.includes(surfaceRef)) surfaces.push(surfaceRef);
    }
  }
  return surfaces;
}

export async function runCmuxStatus(args = [], opts = {}) {
  const once = args.includes('--once') || !args.includes('--watch');
  do {
    const app = await codexAppIntegrationStatus();
    console.clear();
    console.log(formatCmuxBanner(app));
    if (once) return app;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  } while (true);
}

function readOption(args, name, fallback = null) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

function codexProfileFromArgs(args = []) {
  const i = Array.isArray(args) ? args.indexOf('--profile') : -1;
  return i >= 0 && args[i + 1] ? String(args[i + 1]) : '';
}

function normalizeWorkspacePayload(payload) {
  if (Array.isArray(payload)) return payload.filter((item) => item && typeof item === 'object');
  if (!payload || typeof payload !== 'object') return [];
  for (const key of ['workspaces', 'workspace', 'items', 'data']) {
    if (Array.isArray(payload[key])) return normalizeWorkspacePayload(payload[key]);
  }
  if (payload.result) return normalizeWorkspacePayload(payload.result);
  return [];
}

function parseWorkspaceLine(line) {
  const text = String(line || '').trim();
  if (!text) return null;
  const ref = text.match(/\bworkspace:\d+\b/i)?.[0] || text.match(/[0-9a-f]{8}-[0-9a-f-]{27,}/i)?.[0] || '';
  return ref ? { ref, title: text.replace(ref, '').trim(), raw: text } : null;
}

function workspaceName(workspace = {}) {
  return String(workspace.name || workspace.title || workspace.label || workspace.workspace_name || workspace.raw_name || '').trim();
}

function workspaceDescription(workspace = {}) {
  return String(workspace.description || workspace.desc || workspace.subtitle || workspace.raw || '').trim();
}

function workspaceCwd(workspace = {}) {
  return String(workspace.cwd || workspace.path || workspace.root || workspace.working_directory || workspace.workspace_cwd || '').trim();
}
