import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ensureDir, exists, globalSksRoot, runProcess, writeTextAtomic } from '../fsx.js';

export const TELEGRAM_HUB_LAUNCH_LABEL = 'com.sneakoscope.telegram-hub';

export interface TelegramHubServicePaths {
  readonly global_root: string;
  readonly launch_agent_path: string;
  readonly stdout_log_path: string;
  readonly stderr_log_path: string;
}

export interface TelegramHubServiceStatus {
  readonly schema: 'sks.telegram-hub-service.v1';
  readonly ok: boolean;
  readonly supported: boolean;
  readonly installed: boolean;
  readonly loaded: boolean;
  readonly running: boolean;
  readonly state: string | null;
  readonly pid: number | null;
  readonly service: string;
  readonly launch_agent_path: string;
  readonly error: string | null;
}

export interface TelegramHubServiceOptions {
  readonly projectRoot: string;
  readonly globalRoot?: string;
  readonly home?: string;
  readonly nodeBin?: string;
  readonly sksEntry?: string;
  readonly launchctl?: string;
  readonly platform?: NodeJS.Platform;
  readonly uid?: number;
  readonly run?: typeof runProcess;
}

export function telegramHubServicePaths(
  globalRoot = globalSksRoot(),
  home = process.env.HOME || os.homedir()
): TelegramHubServicePaths {
  const root = path.resolve(globalRoot);
  const logs = path.join(root, 'telegram', 'logs');
  return {
    global_root: root,
    launch_agent_path: path.join(path.resolve(home), 'Library', 'LaunchAgents', `${TELEGRAM_HUB_LAUNCH_LABEL}.plist`),
    stdout_log_path: path.join(logs, 'hub.out.log'),
    stderr_log_path: path.join(logs, 'hub.err.log')
  };
}

export function telegramHubLaunchAgentSource(input: {
  readonly nodeBin: string;
  readonly sksEntry: string;
  readonly projectRoot: string;
  readonly paths: TelegramHubServicePaths;
}): string {
  const args = [
    '/usr/bin/caffeinate',
    '-i',
    input.nodeBin,
    input.sksEntry,
    'telegram',
    'hub',
    'run',
    '--project-root',
    path.resolve(input.projectRoot),
    '--json'
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${TELEGRAM_HUB_LAUNCH_LABEL}</string>
<key>ProgramArguments</key><array>${args.map((value) => `<string>${xml(value)}</string>`).join('')}</array>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
<key>ProcessType</key><string>Background</string>
<key>ThrottleInterval</key><integer>5</integer>
<key>StandardOutPath</key><string>${xml(input.paths.stdout_log_path)}</string>
<key>StandardErrorPath</key><string>${xml(input.paths.stderr_log_path)}</string>
</dict></plist>
`;
}

export async function installAndStartTelegramHubService(options: TelegramHubServiceOptions): Promise<TelegramHubServiceStatus> {
  const platform = options.platform ?? process.platform;
  const paths = telegramHubServicePaths(options.globalRoot, options.home);
  if (platform !== 'darwin') return unsupportedStatus(paths, 'telegram_launch_agent_requires_macos', options.uid);
  const nodeBin = path.resolve(options.nodeBin ?? process.execPath);
  const sksEntry = path.resolve(options.sksEntry ?? process.argv[1] ?? '');
  if (!await exists(nodeBin) || !await exists(sksEntry)) throw new Error('telegram_launch_agent_runtime_missing');
  await ensureDir(path.dirname(paths.launch_agent_path));
  await ensureDir(path.dirname(paths.stdout_log_path));
  const plist = telegramHubLaunchAgentSource({
    nodeBin,
    sksEntry,
    projectRoot: options.projectRoot,
    paths
  });
  await writeTextAtomic(paths.launch_agent_path, plist, { mode: 0o644 });
  const run = options.run ?? runProcess;
  const launchctl = options.launchctl ?? '/bin/launchctl';
  const domain = launchDomain(options.uid);
  const service = `${domain}/${TELEGRAM_HUB_LAUNCH_LABEL}`;
  await run(launchctl, ['bootout', service], { timeoutMs: 5_000, maxOutputBytes: 16 * 1024 }).catch(() => undefined);
  const bootstrap = await run(launchctl, ['bootstrap', domain, paths.launch_agent_path], {
    timeoutMs: 10_000,
    maxOutputBytes: 32 * 1024
  });
  if (bootstrap.code !== 0 && !bootstrap.timedOut) {
    return {
      ...(await telegramHubServiceStatus({ ...options, run, launchctl })),
      ok: false,
      error: boundedError(bootstrap.stderr || bootstrap.stdout || 'launchctl_bootstrap_failed')
    };
  }
  await run(launchctl, ['kickstart', '-k', service], { timeoutMs: 10_000, maxOutputBytes: 32 * 1024 }).catch(() => undefined);
  return waitForTelegramHubService({ ...options, run, launchctl });
}

export async function stopTelegramHubService(options: TelegramHubServiceOptions): Promise<TelegramHubServiceStatus> {
  const paths = telegramHubServicePaths(options.globalRoot, options.home);
  const platform = options.platform ?? process.platform;
  if (platform !== 'darwin') return unsupportedStatus(paths, 'telegram_launch_agent_requires_macos', options.uid);
  const run = options.run ?? runProcess;
  const launchctl = options.launchctl ?? '/bin/launchctl';
  const service = `${launchDomain(options.uid)}/${TELEGRAM_HUB_LAUNCH_LABEL}`;
  const stopped = await run(launchctl, ['bootout', service], { timeoutMs: 8_000, maxOutputBytes: 32 * 1024 });
  const status = await telegramHubServiceStatus({ ...options, run, launchctl });
  if (!status.running) return { ...status, ok: true, loaded: false, error: null };
  return {
    ...status,
    ok: false,
    error: boundedError(stopped.stderr || stopped.stdout || 'launchctl_bootout_failed')
  };
}

export async function restartTelegramHubService(options: TelegramHubServiceOptions): Promise<TelegramHubServiceStatus> {
  await stopTelegramHubService(options).catch(() => undefined);
  return installAndStartTelegramHubService(options);
}

export async function telegramHubServiceStatus(options: TelegramHubServiceOptions): Promise<TelegramHubServiceStatus> {
  const paths = telegramHubServicePaths(options.globalRoot, options.home);
  const service = `${launchDomain(options.uid)}/${TELEGRAM_HUB_LAUNCH_LABEL}`;
  if ((options.platform ?? process.platform) !== 'darwin') {
    return unsupportedStatus(paths, 'telegram_launch_agent_requires_macos', options.uid);
  }
  const installed = await exists(paths.launch_agent_path);
  const run = options.run ?? runProcess;
  const launchctl = options.launchctl ?? '/bin/launchctl';
  const result = await run(launchctl, ['print', service], { timeoutMs: 3_000, maxOutputBytes: 32 * 1024 })
    .catch((error: unknown) => ({
      code: 1,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      timedOut: false
    }));
  const text = `${result.stdout || ''}\n${result.stderr || ''}`;
  const state = text.match(/^[ \t]*state = ([^\n]+)/m)?.[1]?.trim() ?? null;
  const pidText = text.match(/^[ \t]*pid = (\d+)/m)?.[1] ?? null;
  const pid = pidText ? Number(pidText) : null;
  const loaded = result.code === 0;
  const running = loaded && state === 'running' && Boolean(pid);
  return {
    schema: 'sks.telegram-hub-service.v1',
    ok: running,
    supported: true,
    installed,
    loaded,
    running,
    state,
    pid,
    service,
    launch_agent_path: paths.launch_agent_path,
    error: running ? null : loaded ? 'telegram_hub_not_running' : boundedError(result.stderr || result.stdout || 'telegram_hub_not_loaded')
  };
}

export async function removeTelegramHubService(options: TelegramHubServiceOptions): Promise<TelegramHubServiceStatus> {
  await stopTelegramHubService(options).catch(() => undefined);
  const paths = telegramHubServicePaths(options.globalRoot, options.home);
  await fsp.unlink(paths.launch_agent_path).catch(() => undefined);
  const status = await telegramHubServiceStatus(options);
  return { ...status, installed: false, ok: !status.running };
}

function unsupportedStatus(
  paths: TelegramHubServicePaths,
  error: string,
  uid?: number
): TelegramHubServiceStatus {
  return {
    schema: 'sks.telegram-hub-service.v1',
    ok: false,
    supported: false,
    installed: false,
    loaded: false,
    running: false,
    state: null,
    pid: null,
    service: `${launchDomain(uid)}/${TELEGRAM_HUB_LAUNCH_LABEL}`,
    launch_agent_path: paths.launch_agent_path,
    error
  };
}

async function waitForTelegramHubService(options: TelegramHubServiceOptions): Promise<TelegramHubServiceStatus> {
  let status = await telegramHubServiceStatus(options);
  for (let attempt = 0; attempt < 25 && !status.running; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    status = await telegramHubServiceStatus(options);
  }
  return status;
}

function launchDomain(uid = typeof process.getuid === 'function' ? process.getuid() : 0): string {
  return `gui/${uid}`;
}

function boundedError(value: unknown): string {
  return String(value || '').replace(/(?:\/Users|\/home)\/[^\s]+/g, '[path-redacted]').slice(0, 500);
}

function xml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
