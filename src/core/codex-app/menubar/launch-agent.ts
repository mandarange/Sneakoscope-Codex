import fs from 'node:fs/promises';
import path from 'node:path';
import { exists, runProcess, which } from '../../fsx.js';
import { CONTROL_CENTER_DOMAIN, CONTROL_CENTER_PREFERRED_POSITION, SKS_MENUBAR_LABEL } from './constants.js';
import type { SksMenuBarInstallResult, SksMenuBarStatusResult } from './types.js';
import type { sksMenuBarPaths } from './paths.js';

export function launchAgentSource(executablePath: string, installDir: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${SKS_MENUBAR_LABEL}</string>
<key>ProgramArguments</key><array><string>${xml(executablePath)}</string></array>
<key>RunAtLoad</key><true/>
<key>ProcessType</key><string>Interactive</string>
<key>StandardOutPath</key><string>${xml(path.join(installDir, 'menubar.out.log'))}</string>
<key>StandardErrorPath</key><string>${xml(path.join(installDir, 'menubar.err.log'))}</string>
</dict></plist>\n`;
}

export async function seedMenuBarPreferredPosition(env: NodeJS.ProcessEnv): Promise<boolean> {
  const defaults = env.SKS_MENUBAR_DEFAULTS || await which('defaults').catch(() => null) || '/usr/bin/defaults';
  const writes = [
    ['write', CONTROL_CENTER_DOMAIN, `NSStatusItem Preferred Position ${SKS_MENUBAR_LABEL}`, '-int', String(CONTROL_CENTER_PREFERRED_POSITION)],
    ['write', CONTROL_CENTER_DOMAIN, `NSStatusItem Visible ${SKS_MENUBAR_LABEL}`, '-bool', 'true'],
    ['write', CONTROL_CENTER_DOMAIN, `NSStatusItem VisibleCC ${SKS_MENUBAR_LABEL}`, '-bool', 'true']
  ];
  for (const args of writes) {
    const result = await runProcess(defaults, args, { timeoutMs: 5_000, maxOutputBytes: 8 * 1024 }).catch(() => ({ code: 1 }));
    if (result.code !== 0) return false;
  }
  return true;
}

export async function launchMenuBar(input: {
  launchctl: string;
  open: string | null;
  paths: ReturnType<typeof sksMenuBarPaths>;
  env?: NodeJS.ProcessEnv;
}): Promise<NonNullable<SksMenuBarInstallResult['launch']>> {
  const domain = launchDomain();
  const service = launchServiceName();
  await runProcess(input.launchctl, ['bootout', service], { timeoutMs: 3_000, maxOutputBytes: 8 * 1024 }).catch(() => undefined);
  await runProcess(input.launchctl, ['bootout', domain, input.paths.launch_agent_path], { timeoutMs: 3_000, maxOutputBytes: 8 * 1024 }).catch(() => undefined);
  await terminateExistingMenuBarProcess(input.paths.executable_path);
  const bootstrap = await runProcess(input.launchctl, ['bootstrap', domain, input.paths.launch_agent_path], {
    timeoutMs: timeoutFromEnv(input.env, 'SKS_MENUBAR_BOOTSTRAP_TIMEOUT_MS', 8_000),
    maxOutputBytes: 16 * 1024
  }).catch((error: unknown) => failedProcess(error));
  if (bootstrap.timedOut) {
    const probe = await waitForLaunchdServiceRunning(input.launchctl, service, input.env);
    return {
      requested: true,
      method: 'launchctl',
      ok: probe.running,
      bootstrap_code: bootstrap.code,
      bootstrap_timed_out: true,
      print_code: probe.code,
      verified_running_after_timeout: probe.running,
      terminal_uncertain: !probe.running,
      error: probe.running ? null : probe.error || 'launchctl_bootstrap_timed_out'
    };
  }
  if (bootstrap.code === 0) {
    const kickstart = await runProcess(input.launchctl, ['kickstart', '-k', service], {
      timeoutMs: timeoutFromEnv(input.env, 'SKS_MENUBAR_KICKSTART_TIMEOUT_MS', 8_000),
      maxOutputBytes: 16 * 1024
    }).catch((error: unknown) => failedProcess(error));
    if (kickstart.code === 0 || kickstart.timedOut) {
      const probe = await waitForLaunchdServiceRunning(input.launchctl, service, input.env);
      const terminalUncertain = !probe.running && (kickstart.timedOut || probe.code !== 0);
      return {
        requested: true,
        method: 'launchctl',
        ok: probe.running,
        bootstrap_code: bootstrap.code,
        bootstrap_timed_out: false,
        kickstart_code: kickstart.code,
        kickstart_timed_out: kickstart.timedOut,
        print_code: probe.code,
        verified_running_after_timeout: kickstart.timedOut && probe.running,
        terminal_uncertain: terminalUncertain,
        error: probe.running ? null : probe.error || (kickstart.timedOut ? 'launchctl_kickstart_timed_out' : 'launchctl_kickstart_not_running')
      };
    }
    return { requested: true, method: 'launchctl', ok: false, bootstrap_code: bootstrap.code, bootstrap_timed_out: false, kickstart_code: kickstart.code, kickstart_timed_out: false, error: String(kickstart.stderr || kickstart.stdout).trim() };
  }
  if (input.open) {
    const opened = await runProcess(input.open, [input.paths.app_path], { timeoutMs: 8_000, maxOutputBytes: 16 * 1024 })
      .catch((error: unknown) => ({ code: 1, stdout: '', stderr: error instanceof Error ? error.message : String(error) }));
    return { requested: true, method: 'open-fallback', ok: opened.code === 0, bootstrap_code: bootstrap.code, bootstrap_timed_out: false, open_code: opened.code, error: opened.code === 0 ? null : String(opened.stderr || bootstrap.stderr).trim() };
  }
  return { requested: true, method: 'launchctl', ok: false, bootstrap_code: bootstrap.code, bootstrap_timed_out: false, error: String(bootstrap.stderr || bootstrap.stdout || 'launchctl_bootstrap_failed').trim() };
}

export async function inspectLaunchdService(env: NodeJS.ProcessEnv = process.env): Promise<SksMenuBarStatusResult['launchd']> {
  if (process.platform !== 'darwin') return { checked: false, ok: true, service: null, state: null, pid: null, error: null };
  const launchctl = env.SKS_MENUBAR_LAUNCHCTL || await which('launchctl').catch(() => null) || '/bin/launchctl';
  const service = launchServiceName();
  const probe = await printLaunchdService(launchctl, service, timeoutFromEnv(env, 'SKS_MENUBAR_PRINT_TIMEOUT_MS', 2_000));
  return { checked: true, ok: probe.running, service, state: probe.state, pid: probe.pid, error: probe.running ? null : probe.error };
}

export async function restartLaunchAgent(paths: ReturnType<typeof sksMenuBarPaths>, env: NodeJS.ProcessEnv) {
  const launchctl = env.SKS_MENUBAR_LAUNCHCTL || await which('launchctl').catch(() => null) || '/bin/launchctl';
  const open = env.SKS_MENUBAR_OPEN || await which('open').catch(() => null) || '/usr/bin/open';
  const service = launchServiceName();
  const result = await runProcess(launchctl, ['kickstart', '-k', service], {
    timeoutMs: timeoutFromEnv(env, 'SKS_MENUBAR_KICKSTART_TIMEOUT_MS', 5_000),
    maxOutputBytes: 16 * 1024
  }).catch((error: unknown) => failedProcess(error));
  if (result.code === 0 || result.timedOut) {
    const probe = await waitForLaunchdServiceRunning(launchctl, service, env);
    const terminalUncertain = !probe.running && (result.timedOut || probe.code !== 0);
    return {
      ok: probe.running,
      code: result.code,
      timed_out: result.timedOut,
      print_code: probe.code,
      verified_running_after_timeout: result.timedOut && probe.running,
      terminal_uncertain: terminalUncertain,
      recovered_via_bootstrap: false,
      error: probe.running ? null : probe.error || (result.timedOut ? 'launchctl_kickstart_timed_out' : 'launchctl_kickstart_not_running'),
      paths
    };
  }
  // Diagnostics "Restart Menu Bar" and `sks menubar restart` used to kickstart only.
  // When the LaunchAgent plist exists but is not loaded into the GUI domain
  // (common after bootout, logout, or a failed prior install), kickstart fails
  // with "Could not find service …" and Control Center becomes unreachable.
  // Re-bootstrap the existing agent instead of forcing a full rebuild.
  const kickstartError = String(result.stderr || result.stdout).trim();
  if (await exists(paths.launch_agent_path) && await exists(paths.executable_path) && isUnloadableLaunchdKickstartError(kickstartError)) {
    const launch = await launchMenuBar({ launchctl, open, paths, env });
    return {
      ok: launch.ok,
      code: launch.kickstart_code ?? launch.bootstrap_code ?? result.code,
      timed_out: Boolean(launch.kickstart_timed_out || launch.bootstrap_timed_out),
      print_code: launch.print_code ?? null,
      verified_running_after_timeout: Boolean(launch.verified_running_after_timeout),
      terminal_uncertain: Boolean(launch.terminal_uncertain),
      recovered_via_bootstrap: true,
      error: launch.error ?? (launch.ok ? null : kickstartError),
      paths
    };
  }
  return {
    ok: false,
    code: result.code,
    timed_out: false,
    print_code: null,
    verified_running_after_timeout: false,
    terminal_uncertain: false,
    recovered_via_bootstrap: false,
    error: kickstartError,
    paths
  };
}

export function isUnloadableLaunchdKickstartError(text: string): boolean {
  const normalized = String(text || '').toLowerCase();
  return normalized.includes('could not find service')
    || normalized.includes('could not kickstart service')
    || /\bbad request\b/.test(normalized)
    || normalized.includes('operation not permitted')
    || normalized.includes('no such process')
    || normalized.includes('input/output error');
}

export async function removeLaunchAgent(paths: ReturnType<typeof sksMenuBarPaths>, env: NodeJS.ProcessEnv): Promise<{ actions: string[]; warnings: string[]; blockers: string[] }> {
  const actions: string[] = [];
  const warnings: string[] = [];
  const blockers: string[] = [];
  const launchctl = env.SKS_MENUBAR_LAUNCHCTL || await which('launchctl').catch(() => null) || '/bin/launchctl';
  await runProcess(launchctl, ['bootout', launchServiceName()], { timeoutMs: 3_000, maxOutputBytes: 8 * 1024 }).catch(() => undefined);
  await terminateExistingMenuBarProcess(paths.executable_path);
  await fs.rm(paths.launch_agent_path, { force: true }).catch((error: unknown) => blockers.push(`remove_launch_agent_failed:${String(error)}`));
  await fs.rm(paths.install_dir, { recursive: true, force: true }).catch((error: unknown) => blockers.push(`remove_install_dir_failed:${String(error)}`));
  actions.push(`removed ${paths.launch_agent_path}`, `removed ${paths.install_dir}`);
  const defaults = env.SKS_MENUBAR_DEFAULTS || await which('defaults').catch(() => null) || '/usr/bin/defaults';
  for (const key of [`NSStatusItem Preferred Position ${SKS_MENUBAR_LABEL}`, `NSStatusItem Visible ${SKS_MENUBAR_LABEL}`, `NSStatusItem VisibleCC ${SKS_MENUBAR_LABEL}`]) {
    await runProcess(defaults, ['delete', CONTROL_CENTER_DOMAIN, key], { timeoutMs: 3_000, maxOutputBytes: 8 * 1024 }).catch(() => warnings.push(`defaults_cleanup_failed:${key}`));
  }
  return { actions, warnings, blockers };
}

export async function isMenuBarProcessRunning(executablePath: string): Promise<boolean> {
  const pgrep = await which('pgrep').catch(() => null) || '/usr/bin/pgrep';
  const result = await runProcess(pgrep, ['-f', executablePath], { timeoutMs: 2_000, maxOutputBytes: 8 * 1024 }).catch(() => ({ code: 1 }));
  return result.code === 0;
}

async function terminateExistingMenuBarProcess(executablePath: string): Promise<void> {
  if (!(await exists(executablePath))) return;
  const pkill = await which('pkill').catch(() => null) || '/usr/bin/pkill';
  await runProcess(pkill, ['-f', executablePath], { timeoutMs: 3_000, maxOutputBytes: 8 * 1024 }).catch(() => undefined);
}

export function launchDomain(): string {
  const uid = typeof process.getuid === 'function' ? process.getuid() : null;
  return uid === null ? 'gui' : `gui/${uid}`;
}

export function launchServiceName(): string {
  return `${launchDomain()}/${SKS_MENUBAR_LABEL}`;
}

type LaunchdServiceProbe = {
  code: number | null;
  timedOut: boolean;
  running: boolean;
  state: string | null;
  pid: number | null;
  activeCount: number | null;
  error: string | null;
};

async function waitForLaunchdServiceRunning(
  launchctl: string,
  service: string,
  env: NodeJS.ProcessEnv | undefined
): Promise<LaunchdServiceProbe> {
  const readbackTimeoutMs = timeoutFromEnv(env, 'SKS_MENUBAR_LAUNCH_READBACK_TIMEOUT_MS', 8_000);
  const printTimeoutMs = timeoutFromEnv(env, 'SKS_MENUBAR_PRINT_TIMEOUT_MS', 2_000);
  const pollIntervalMs = timeoutFromEnv(env, 'SKS_MENUBAR_LAUNCH_READBACK_INTERVAL_MS', 100);
  const deadline = Date.now() + readbackTimeoutMs;
  let lastProbe: LaunchdServiceProbe | null = null;
  let lastCompletedProbe: LaunchdServiceProbe | null = null;
  while (true) {
    const remainingMs = deadline - Date.now();
    const minimumUsefulProbeMs = Math.min(printTimeoutMs, Math.max(pollIntervalMs, 250));
    if (lastProbe && remainingMs <= minimumUsefulProbeMs) return lastCompletedProbe || lastProbe;
    const probe = await printLaunchdService(launchctl, service, Math.min(printTimeoutMs, remainingMs));
    if (probe.running) return probe;
    lastProbe = probe;
    if (!probe.timedOut) lastCompletedProbe = probe;
    const remainingAfterProbeMs = deadline - Date.now();
    if (remainingAfterProbeMs <= 0) return lastCompletedProbe || probe;
    await delay(Math.min(pollIntervalMs, remainingAfterProbeMs));
  }
}

async function printLaunchdService(launchctl: string, service: string, timeoutMs: number): Promise<LaunchdServiceProbe> {
  const result = await runProcess(launchctl, ['print', service], { timeoutMs, maxOutputBytes: 32 * 1024 })
    .catch((error: unknown) => failedProcess(error));
  const text = `${result.stdout || ''}\n${result.stderr || ''}`;
  const state = text.match(/^[ \t]*state = ([^\n]+)/m)?.[1]?.trim() || null;
  const pidText = text.match(/^[ \t]*pid = (\d+)/m)?.[1] || null;
  const activeCountText = text.match(/^[ \t]*active count = (\d+)/m)?.[1] || null;
  const pid = pidText ? Number(pidText) : null;
  const activeCount = activeCountText ? Number(activeCountText) : null;
  const running = result.code === 0 && state === 'running' && (Boolean(pid) || (activeCount !== null && activeCount > 0));
  return {
    code: result.code,
    timedOut: result.timedOut,
    running,
    state,
    pid,
    activeCount,
    error: running ? null : launchdProbeError(result.code, result.stderr, state, pid, activeCount)
  };
}

function launchdProbeError(
  code: number | null,
  stderr: string,
  state: string | null,
  pid: number | null,
  activeCount: number | null
): string {
  if (code !== 0) {
    const detail = String(stderr || '').trim().split(/\r?\n/, 1)[0]?.slice(0, 512) || '';
    return detail ? `launchctl_print_failed:${code}:${detail}` : `launchctl_print_failed:${code}`;
  }
  return `launchd_not_running:state=${errorToken(state || 'unknown')}:active_count=${activeCount ?? 'unknown'}:pid=${pid ?? 'none'}`;
}

function errorToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9._-]/g, '_');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timeoutFromEnv(env: NodeJS.ProcessEnv | undefined, key: string, fallback: number): number {
  const value = Number.parseInt(String(env?.[key] || ''), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function failedProcess(error: unknown) {
  const timedOut = Boolean(error && typeof error === 'object' && 'timedOut' in error && error.timedOut === true);
  return {
    code: 1,
    stdout: '',
    stderr: error instanceof Error ? error.message : String(error),
    stdoutBytes: 0,
    stderrBytes: 0,
    truncated: false,
    timedOut
  };
}

function xml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
