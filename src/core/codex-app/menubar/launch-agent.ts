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
}): Promise<NonNullable<SksMenuBarInstallResult['launch']>> {
  const domain = launchDomain();
  const service = launchServiceName();
  await runProcess(input.launchctl, ['bootout', service], { timeoutMs: 3_000, maxOutputBytes: 8 * 1024 }).catch(() => undefined);
  await runProcess(input.launchctl, ['bootout', domain, input.paths.launch_agent_path], { timeoutMs: 3_000, maxOutputBytes: 8 * 1024 }).catch(() => undefined);
  await terminateExistingMenuBarProcess(input.paths.executable_path);
  const bootstrap = await runProcess(input.launchctl, ['bootstrap', domain, input.paths.launch_agent_path], { timeoutMs: 8_000, maxOutputBytes: 16 * 1024 })
    .catch((error: unknown) => ({ code: 1, stdout: '', stderr: error instanceof Error ? error.message : String(error) }));
  if (bootstrap.code === 0) {
    const kickstart = await runProcess(input.launchctl, ['kickstart', '-k', service], { timeoutMs: 8_000, maxOutputBytes: 16 * 1024 })
      .catch((error: unknown) => ({ code: 1, stdout: '', stderr: error instanceof Error ? error.message : String(error) }));
    return { requested: true, method: 'launchctl', ok: kickstart.code === 0, bootstrap_code: bootstrap.code, kickstart_code: kickstart.code, error: kickstart.code === 0 ? null : String(kickstart.stderr || kickstart.stdout).trim() };
  }
  if (input.open) {
    const opened = await runProcess(input.open, [input.paths.app_path], { timeoutMs: 8_000, maxOutputBytes: 16 * 1024 })
      .catch((error: unknown) => ({ code: 1, stdout: '', stderr: error instanceof Error ? error.message : String(error) }));
    return { requested: true, method: 'open-fallback', ok: opened.code === 0, bootstrap_code: bootstrap.code, open_code: opened.code, error: opened.code === 0 ? null : String(opened.stderr || bootstrap.stderr).trim() };
  }
  return { requested: true, method: 'launchctl', ok: false, bootstrap_code: bootstrap.code, error: String(bootstrap.stderr || bootstrap.stdout || 'launchctl_bootstrap_failed').trim() };
}

export async function inspectLaunchdService(env: NodeJS.ProcessEnv = process.env): Promise<SksMenuBarStatusResult['launchd']> {
  if (process.platform !== 'darwin') return { checked: false, ok: true, service: null, state: null, pid: null, error: null };
  const launchctl = env.SKS_MENUBAR_LAUNCHCTL || await which('launchctl').catch(() => null) || '/bin/launchctl';
  const service = launchServiceName();
  const result = await runProcess(launchctl, ['print', service], { timeoutMs: 2_000, maxOutputBytes: 32 * 1024 })
    .catch((error: unknown) => ({ code: 1, stdout: '', stderr: error instanceof Error ? error.message : String(error) }));
  const text = `${result.stdout || ''}\n${result.stderr || ''}`;
  const state = text.match(/\bstate = ([^\n]+)/)?.[1]?.trim() || null;
  const pidText = text.match(/\bpid = (\d+)/)?.[1] || null;
  const running = result.code === 0 && (state === 'running' || Boolean(pidText));
  return { checked: true, ok: running, service, state, pid: pidText ? Number(pidText) : null, error: running ? null : String(result.stderr || result.stdout || 'launchd_not_running').trim() };
}

export async function restartLaunchAgent(paths: ReturnType<typeof sksMenuBarPaths>, env: NodeJS.ProcessEnv) {
  const launchctl = env.SKS_MENUBAR_LAUNCHCTL || await which('launchctl').catch(() => null) || '/bin/launchctl';
  const result = await runProcess(launchctl, ['kickstart', '-k', launchServiceName()], { timeoutMs: 5_000, maxOutputBytes: 16 * 1024 })
    .catch((error: unknown) => ({ code: 1, stdout: '', stderr: error instanceof Error ? error.message : String(error) }));
  return { ok: result.code === 0, code: result.code, error: result.code === 0 ? null : String(result.stderr || result.stdout).trim(), paths };
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

function xml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
