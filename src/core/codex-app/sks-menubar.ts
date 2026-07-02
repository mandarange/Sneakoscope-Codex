import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureDir,
  exists,
  PACKAGE_VERSION,
  readJson,
  readText,
  runProcess,
  sha256,
  which,
  writeJsonAtomic,
  writeTextAtomic
} from '../fsx.js';

export interface SksMenuBarBuildStamp {
  schema: 'sks.sks-menubar-build-stamp.v1';
  package_version: string;
  source_sha256: string;
  action_script_sha256: string;
  info_plist_sha256: string;
  launch_agent_sha256: string;
  swiftc_version: string;
  codesign_identifier: string;
}

export interface SksMenuBarTargetCheck {
  requested: string | null;
  resolved: string | null;
  packaged: string;
  exists: boolean;
  project_local: boolean;
  used_previous_script: boolean;
}

export interface SksMenuBarInstallResult {
  schema: 'sks.codex-app-sks-menubar.v1';
  ok: boolean;
  apply: boolean;
  status: 'planned' | 'installed' | 'installed_launch_skipped' | 'installed_open_fallback' | 'unsupported_platform' | 'blocked';
  platform: NodeJS.Platform;
  app_path: string | null;
  executable_path: string | null;
  launch_agent_path: string | null;
  action_script_path: string | null;
  build_stamp_path: string | null;
  report_path: string | null;
  menu_items: string[];
  actions: string[];
  launch?: {
    requested: boolean;
    method: 'launchctl' | 'open-fallback' | 'skipped' | 'none';
    ok: boolean;
    bootstrap_code?: number | null;
    kickstart_code?: number | null;
    print_code?: number | null;
    open_code?: number | null;
    error?: string | null;
  };
  target_check?: SksMenuBarTargetCheck | undefined;
  build_stamp?: SksMenuBarBuildStamp | null | undefined;
  tcc_automation_status?: 'unknown' | 'granted' | 'denied' | undefined;
  secret_env_cleanup?: SecretLaunchEnvCleanupResult | undefined;
  next_actions: string[];
  blockers: string[];
  warnings: string[];
  report_write_failed?: boolean;
}

export interface SksMenuBarInstallOptions {
  apply?: boolean;
  launch?: boolean;
  root?: string;
  home?: string;
  sksEntry?: string;
  env?: NodeJS.ProcessEnv;
}

export interface SecretLaunchEnvCleanupResult {
  ok: boolean;
  status: 'cleaned' | 'skipped' | 'not_macos' | 'launchctl_missing' | 'partial';
  variables: string[];
  cleaned: string[];
  failed: Array<{ key: string; error: string }>;
  next_actions: string[];
}

export interface SksMenuBarStatusResult {
  schema: 'sks.menubar-status.v1';
  ok: boolean;
  platform: NodeJS.Platform;
  installed: boolean;
  running: boolean;
  paths: ReturnType<typeof sksMenuBarPaths>;
  launchd: {
    checked: boolean;
    ok: boolean;
    service: string | null;
    state: string | null;
    pid: number | null;
    error: string | null;
  };
  action_target: {
    node_bin: string | null;
    node_exists: boolean;
    sks_entry: string | null;
    sks_entry_exists: boolean;
    ok: boolean;
  };
  build_stamp: SksMenuBarBuildStamp | null;
  package_version: string;
  signature: {
    checked: boolean;
    identifier: string | null;
    ok: boolean;
    error: string | null;
  };
  blockers: string[];
  warnings: string[];
  next_actions: string[];
}

export interface SksMenuBarUninstallResult {
  schema: 'sks.menubar-uninstall.v1';
  ok: boolean;
  platform: NodeJS.Platform;
  paths: ReturnType<typeof sksMenuBarPaths>;
  actions: string[];
  warnings: string[];
  blockers: string[];
}

export const SKS_MENUBAR_LABEL = 'com.sneakoscope.sks-menubar';
const LABEL = SKS_MENUBAR_LABEL;
const CONTROL_CENTER_DOMAIN = 'com.apple.controlcenter';
const CONTROL_CENTER_PREFERRED_POSITION = 360;
const SECRET_LAUNCH_ENV_KEYS = ['CODEX_LB_API_KEY', 'OPENROUTER_API_KEY'];
const MENU_ITEMS = [
  'Use codex-lb',
  'Use ChatGPT OAuth',
  'Set codex-lb Domain and Key',
  'Set OpenRouter Key and GLM Profiles',
  'Fast Check',
  'SKS Version Check',
  'Update SKS Now',
  'Open Codex Settings',
  'Restart Codex',
  'Quit SKS Menu'
];

export function sksMenuBarPaths(homeInput?: string, rootInput?: string) {
  const home = path.resolve(homeInput || process.env.HOME || os.homedir());
  const root = path.resolve(rootInput || process.cwd());
  const installDir = path.join(home, '.codex', 'sks-menubar');
  const appPath = path.join(installDir, 'SKSMenuBar.app');
  const contentsPath = path.join(appPath, 'Contents');
  const macosPath = path.join(contentsPath, 'MacOS');
  return {
    home,
    root,
    install_dir: installDir,
    app_path: appPath,
    staging_app_path: `${appPath}.staging`,
    backup_app_path: `${appPath}.previous`,
    contents_path: contentsPath,
    macos_path: macosPath,
    executable_path: path.join(macosPath, 'SKSMenuBar'),
    source_path: path.join(installDir, 'SKSMenuBar.swift'),
    info_plist_path: path.join(contentsPath, 'Info.plist'),
    action_script_path: path.join(installDir, 'sks-menubar-action.sh'),
    build_stamp_path: path.join(installDir, 'build-stamp.json'),
    launch_agent_path: path.join(home, 'Library', 'LaunchAgents', `${LABEL}.plist`),
    report_path: path.join(root, '.sneakoscope', 'reports', 'sks-menubar.json'),
    stdout_log_path: path.join(installDir, 'menubar.out.log'),
    stderr_log_path: path.join(installDir, 'menubar.err.log')
  };
}

export async function installSksMenuBar(opts: SksMenuBarInstallOptions = {}): Promise<SksMenuBarInstallResult> {
  const apply = opts.apply === true;
  const env = opts.env || process.env;
  const paths = sksMenuBarPaths(opts.home || env.HOME, opts.root);
  const actions: string[] = [];
  const warnings: string[] = [];
  const nextActions = defaultNextActions();
  let secretEnvCleanup: SecretLaunchEnvCleanupResult | undefined;

  if (process.platform !== 'darwin') {
    const result: SksMenuBarInstallResult = {
      schema: 'sks.codex-app-sks-menubar.v1',
      ok: true,
      apply,
      status: 'unsupported_platform',
      platform: process.platform,
      app_path: null,
      executable_path: null,
      launch_agent_path: null,
      action_script_path: null,
      build_stamp_path: null,
      report_path: apply ? paths.report_path : null,
      menu_items: MENU_ITEMS,
      actions: [],
      launch: { requested: false, method: 'none', ok: true },
      tcc_automation_status: 'unknown',
      next_actions: [],
      blockers: [],
      warnings: ['sks_menubar_requires_macos']
    };
    if (apply) await writeReport(paths.report_path, result);
    return result;
  }

  if (!apply) {
    const installed = await exists(paths.executable_path);
    const launchAgent = await exists(paths.launch_agent_path);
    const status = await inspectSksMenuBarStatus({ home: paths.home, root: paths.root }).catch(() => null);
    return {
      schema: 'sks.codex-app-sks-menubar.v1',
      ok: true,
      apply,
      status: 'planned',
      platform: process.platform,
      app_path: paths.app_path,
      executable_path: paths.executable_path,
      launch_agent_path: paths.launch_agent_path,
      action_script_path: paths.action_script_path,
      build_stamp_path: paths.build_stamp_path,
      report_path: paths.report_path,
      menu_items: MENU_ITEMS,
      actions: installed ? ['menubar_app_present'] : ['menubar_app_install_available'],
      launch: {
        requested: false,
        method: 'skipped',
        ok: true
      },
      target_check: status ? {
        requested: null,
        resolved: status.action_target.sks_entry,
        packaged: packagedSksEntry(),
        exists: status.action_target.sks_entry_exists,
        project_local: status.action_target.sks_entry ? isSubpath(status.action_target.sks_entry, paths.root) : false,
        used_previous_script: false
      } : undefined,
      build_stamp: status?.build_stamp || null,
      tcc_automation_status: 'unknown',
      next_actions: launchAgent ? defaultNextActions() : ['Run: sks menubar install'],
      blockers: [],
      warnings: launchAgent ? [] : ['launch_agent_not_installed_yet']
    };
  }

  await ensureDir(paths.install_dir);
  await ensureDir(path.dirname(paths.launch_agent_path));
  secretEnvCleanup = await cleanupMacLaunchSecretEnvironment({ env }).catch((err: any) => ({
    ok: false,
    status: 'partial',
    variables: SECRET_LAUNCH_ENV_KEYS,
    cleaned: [],
    failed: SECRET_LAUNCH_ENV_KEYS.map((key) => ({ key, error: err?.message || String(err) })),
    next_actions: ['Rotate CODEX_LB_API_KEY and OPENROUTER_API_KEY if they were previously exposed in launchd.']
  } satisfies SecretLaunchEnvCleanupResult));
  if (secretEnvCleanup.status === 'cleaned') actions.push('removed secret API keys from launchd user environment');
  if (!secretEnvCleanup.ok && !secretEnvCleanup.failed.every((row) => row.error === 'empty')) warnings.push('launch_secret_env_cleanup_incomplete');

  const swiftc = env.SKS_MENUBAR_SWIFTC || await which('swiftc').catch(() => null) || await fallbackTool('/usr/bin/swiftc');
  const launchctl = env.SKS_MENUBAR_LAUNCHCTL || await which('launchctl').catch(() => null) || await fallbackTool('/bin/launchctl');
  const open = env.SKS_MENUBAR_OPEN || await which('open').catch(() => null) || await fallbackTool('/usr/bin/open');
  const codesign = env.SKS_MENUBAR_CODESIGN || await which('codesign').catch(() => null) || await fallbackTool('/usr/bin/codesign');
  const xcodeSelect = env.SKS_MENUBAR_XCODE_SELECT || await which('xcode-select').catch(() => null) || await fallbackTool('/usr/bin/xcode-select');
  if (!swiftc) return await blockedResult('swiftc_missing', 'swiftc not found');
  const swiftcVersion = await toolVersion(swiftc, ['--version']);

  const target = await resolveSksEntryForInstall({
    ...(opts.sksEntry ? { explicit: opts.sksEntry } : {}),
    root: paths.root,
    home: paths.home,
    env,
    actionScriptPath: paths.action_script_path,
    warnings
  });
  const previousActionScript = await readText(paths.action_script_path, '');
  if (!target.exists && previousActionScript) actions.push('kept previous action script because resolved SKS entry was missing');
  if (!target.exists && !previousActionScript) {
    return await blockedResult('sks_entry_unresolved', `Resolved SKS entry does not exist: ${target.resolved || target.packaged}`);
  }

  const actionScript = target.used_previous_script
    ? previousActionScript
    : actionScriptSource({ nodeBin: process.execPath, sksEntry: target.resolved || target.packaged });
  const swiftSource = swiftMenuSource({
    actionScriptPath: paths.action_script_path,
    buildStampPath: paths.build_stamp_path,
    packageVersion: PACKAGE_VERSION
  });
  const infoPlist = infoPlistSource(PACKAGE_VERSION);
  const launchAgent = launchAgentSource(paths.executable_path, paths.install_dir);
  const stamp: SksMenuBarBuildStamp = {
    schema: 'sks.sks-menubar-build-stamp.v1',
    package_version: PACKAGE_VERSION,
    source_sha256: sha256(swiftSource),
    action_script_sha256: sha256(actionScript),
    info_plist_sha256: sha256(infoPlist),
    launch_agent_sha256: sha256(launchAgent),
    swiftc_version: swiftcVersion,
    codesign_identifier: LABEL
  };
  const previousStamp = await readJson<SksMenuBarBuildStamp | null>(paths.build_stamp_path, null);
  const appInstalled = await exists(paths.executable_path);
  const stampMatches = appInstalled && buildStampEquals(previousStamp, stamp);
  const binaryStable = appInstalled
    && previousStamp?.schema === stamp.schema
    && previousStamp.package_version === stamp.package_version
    && previousStamp.source_sha256 === stamp.source_sha256
    && previousStamp.info_plist_sha256 === stamp.info_plist_sha256
    && previousStamp.swiftc_version === stamp.swiftc_version
    && previousStamp.codesign_identifier === stamp.codesign_identifier;

  if (stampMatches) {
    actions.push('menubar_up_to_date');
  } else {
    if (!target.used_previous_script && await readText(paths.action_script_path, '') !== actionScript) {
      await writeTextAtomic(paths.action_script_path, actionScript);
      await fs.chmod(paths.action_script_path, 0o755);
      actions.push(`wrote ${paths.action_script_path}`);
    } else if (!target.used_previous_script) {
      await fs.chmod(paths.action_script_path, 0o755).catch(() => undefined);
    }
  }

  if (!stampMatches && !binaryStable) {
    const clt = await xcodeCltStatus(xcodeSelect);
    if (!clt.ok) return await blockedResult('xcode_clt_missing', clt.error || 'Xcode Command Line Tools missing');
    try {
      await buildMenuBarAppAtomically({
        paths,
        swiftc,
        codesign,
        swiftSource,
        infoPlist,
        actions
      });
    } catch (err: any) {
      return await blockedResult(err?.blocker || 'swift_compile_failed', err?.message || String(err));
    }
  } else if (!stampMatches) {
    actions.push('kept existing signed menu bar binary');
  }

  if (!stampMatches || previousStamp?.launch_agent_sha256 !== stamp.launch_agent_sha256 || !(await exists(paths.launch_agent_path))) {
    await writeTextAtomic(paths.launch_agent_path, launchAgent);
    actions.push(`wrote ${paths.launch_agent_path}`);
  }
  await writeJsonAtomic(paths.build_stamp_path, stamp);
  actions.push(`wrote ${paths.build_stamp_path}`);

  const launchWanted = opts.launch !== false && env.SKS_SKIP_SKS_MENUBAR_LAUNCH !== '1';
  const launchAllowedForHome = path.resolve(paths.home) === realUserHome();
  const installUnderTempDir = isMenuBarInstallPathUnderTempDir(paths.executable_path, env);
  if (launchWanted && !launchAllowedForHome) warnings.push('launch_skipped_non_user_home');
  if (launchWanted && installUnderTempDir) warnings.push('launch_skipped_temp_install');
  const launchRequested = launchWanted && launchAllowedForHome && !installUnderTempDir;
  let runningBeforeLaunch = false;
  if (launchRequested) runningBeforeLaunch = await isMenuBarProcessRunning(paths.executable_path);
  if (launchRequested && stampMatches && runningBeforeLaunch) actions.push('launch_skipped_menubar_up_to_date_and_running');
  if (launchRequested && !stampMatches) {
    const preferredPosition = await seedMenuBarPreferredPosition(env);
    if (preferredPosition.ok) actions.push('seeded SKS menu bar preferred position');
    else warnings.push(preferredPosition.warning);
  }
  const launch = launchRequested && launchctl && !(stampMatches && runningBeforeLaunch)
    ? await launchWithLaunchctl({ launchctl, open, paths, skipIfRunning: stampMatches })
    : {
        requested: launchRequested && !(stampMatches && runningBeforeLaunch),
        method: 'skipped' as const,
        ok: !launchRequested || (stampMatches && runningBeforeLaunch),
        error: launchRequested && !launchctl ? 'launchctl_missing' : null
      };
  if (launchRequested && !launchctl) warnings.push('launchctl_missing');
  if (launch.method === 'open-fallback') warnings.push('launchctl_bootstrap_failed_open_fallback_used');

  const ok = launch.ok === true;
  const result: SksMenuBarInstallResult = {
    schema: 'sks.codex-app-sks-menubar.v1',
    ok,
    apply,
    status: ok
      ? launch.requested === false || launch.method === 'skipped'
        ? 'installed_launch_skipped'
        : launch.method === 'open-fallback'
          ? 'installed_open_fallback'
          : 'installed'
      : 'blocked',
    platform: process.platform,
    app_path: paths.app_path,
    executable_path: paths.executable_path,
    launch_agent_path: paths.launch_agent_path,
    action_script_path: paths.action_script_path,
    build_stamp_path: paths.build_stamp_path,
    report_path: paths.report_path,
    menu_items: MENU_ITEMS,
    actions,
    launch,
    target_check: target,
    build_stamp: stamp,
    tcc_automation_status: 'unknown',
    secret_env_cleanup: secretEnvCleanup,
    next_actions: [
      ...nextActions,
      'If Terminal automation was denied: System Settings > Privacy & Security > Automation > SKS Menu Bar > Terminal.'
    ],
    blockers: ok ? [] : [launch.error || 'sks_menubar_launch_failed'],
    warnings
  };
  await writeReport(paths.report_path, result);
  return result;

  async function blockedResult(reason: string, detail?: string): Promise<SksMenuBarInstallResult> {
    const result: SksMenuBarInstallResult = {
      schema: 'sks.codex-app-sks-menubar.v1',
      ok: false,
      apply,
      status: 'blocked',
      platform: process.platform,
      app_path: paths.app_path,
      executable_path: paths.executable_path,
      launch_agent_path: paths.launch_agent_path,
      action_script_path: paths.action_script_path,
      build_stamp_path: paths.build_stamp_path,
      report_path: paths.report_path,
      menu_items: MENU_ITEMS,
      actions,
      launch: { requested: false, method: 'none', ok: false, error: detail || reason },
      build_stamp: null,
      tcc_automation_status: 'unknown',
      secret_env_cleanup: secretEnvCleanup,
      next_actions: reason === 'xcode_clt_missing'
        ? ['Run: xcode-select --install', ...defaultNextActions()]
        : defaultNextActions(),
      blockers: [reason],
      warnings: detail ? [...warnings, detail] : warnings
    };
    await writeReport(paths.report_path, result);
    return result;
  }
}

export async function cleanupMacLaunchSecretEnvironment(opts: { env?: NodeJS.ProcessEnv; force?: boolean } = {}): Promise<SecretLaunchEnvCleanupResult> {
  if (process.platform !== 'darwin' && !opts.force) {
    return { ok: true, status: 'not_macos', variables: SECRET_LAUNCH_ENV_KEYS, cleaned: [], failed: [], next_actions: [] };
  }
  const env = opts.env || process.env;
  const launchctl = env.SKS_MENUBAR_LAUNCHCTL || await which('launchctl').catch(() => null) || await fallbackTool('/bin/launchctl');
  if (!launchctl) {
    return {
      ok: false,
      status: 'launchctl_missing',
      variables: SECRET_LAUNCH_ENV_KEYS,
      cleaned: [],
      failed: SECRET_LAUNCH_ENV_KEYS.map((key) => ({ key, error: 'launchctl_missing' })),
      next_actions: ['Run: launchctl unsetenv CODEX_LB_API_KEY', 'Run: launchctl unsetenv OPENROUTER_API_KEY']
    };
  }
  const cleaned: string[] = [];
  const failed: Array<{ key: string; error: string }> = [];
  for (const key of SECRET_LAUNCH_ENV_KEYS) {
    const result = await runProcess(launchctl, ['unsetenv', key], { timeoutMs: 3_000, maxOutputBytes: 8 * 1024 })
      .catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }));
    if (result.code === 0) cleaned.push(key);
    else failed.push({ key, error: String(result.stderr || result.stdout || 'launchctl unsetenv failed').trim() });
  }
  return {
    ok: failed.length === 0,
    status: failed.length === 0 ? 'cleaned' : cleaned.length ? 'partial' : 'partial',
    variables: SECRET_LAUNCH_ENV_KEYS,
    cleaned,
    failed,
    next_actions: ['Rotate CODEX_LB_API_KEY and OPENROUTER_API_KEY if they were previously exposed in launchd.']
  };
}

export async function inspectSksMenuBarStatus(opts: { home?: string; root?: string; env?: NodeJS.ProcessEnv } = {}): Promise<SksMenuBarStatusResult> {
  const paths = sksMenuBarPaths(opts.home || opts.env?.HOME, opts.root);
  const installed = await exists(paths.executable_path);
  const running = installed ? await isMenuBarProcessRunning(paths.executable_path) : false;
  const actionText = await readText(paths.action_script_path, '');
  const nodeBin = shellAssignment(actionText, 'NODE_BIN');
  const sksEntry = shellAssignment(actionText, 'SKS_ENTRY');
  const nodeExists = nodeBin ? await isExecutable(nodeBin) : false;
  const sksEntryExists = sksEntry ? await exists(sksEntry) : false;
  const buildStamp = await readJson<SksMenuBarBuildStamp | null>(paths.build_stamp_path, null);
  const launchd = await inspectLaunchdService(opts.env);
  const signature = await inspectSignature(paths.app_path, opts.env);
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!installed) blockers.push('menubar_app_missing');
  if (installed && !sksEntryExists) blockers.push('action_script_target_missing');
  if (installed && signature.checked && !signature.ok) warnings.push('codesign_identifier_unexpected');
  if (buildStamp?.package_version && buildStamp.package_version !== PACKAGE_VERSION) warnings.push('build_stamp_package_version_mismatch');
  return {
    schema: 'sks.menubar-status.v1',
    ok: blockers.length === 0,
    platform: process.platform,
    installed,
    running,
    paths,
    launchd,
    action_target: {
      node_bin: nodeBin,
      node_exists: nodeExists,
      sks_entry: sksEntry,
      sks_entry_exists: sksEntryExists,
      ok: Boolean(nodeExists && sksEntryExists)
    },
    build_stamp: buildStamp,
    package_version: PACKAGE_VERSION,
    signature,
    blockers,
    warnings,
    next_actions: blockers.length || warnings.length ? defaultNextActions() : ['sks menubar status --json']
  };
}

export async function restartSksMenuBar(opts: { home?: string; root?: string; env?: NodeJS.ProcessEnv } = {}) {
  const env = opts.env || process.env;
  const paths = sksMenuBarPaths(opts.home || env.HOME, opts.root);
  if (process.platform !== 'darwin') return { schema: 'sks.menubar-restart.v1', ok: true, platform: process.platform, skipped: true, reason: 'not_macos' };
  const launchctl = env.SKS_MENUBAR_LAUNCHCTL || await which('launchctl').catch(() => null) || await fallbackTool('/bin/launchctl');
  if (!launchctl) return { schema: 'sks.menubar-restart.v1', ok: false, platform: process.platform, paths, blockers: ['launchctl_missing'] };
  const service = launchServiceName();
  const result = await runProcess(launchctl, ['kickstart', '-k', service], {
    timeoutMs: 3_000,
    maxOutputBytes: 16 * 1024,
    stdoutFile: path.join(paths.install_dir, 'launchctl.out.log'),
    stderrFile: path.join(paths.install_dir, 'launchctl.err.log')
  }).catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }));
  return {
    schema: 'sks.menubar-restart.v1',
    ok: result.code === 0,
    platform: process.platform,
    service,
    paths,
    code: result.code,
    error: result.code === 0 ? null : String(result.stderr || result.stdout || '').trim()
  };
}

export async function uninstallSksMenuBar(opts: { home?: string; root?: string; env?: NodeJS.ProcessEnv } = {}): Promise<SksMenuBarUninstallResult> {
  const env = opts.env || process.env;
  const paths = sksMenuBarPaths(opts.home || env.HOME, opts.root);
  const actions: string[] = [];
  const warnings: string[] = [];
  const blockers: string[] = [];
  if (process.platform !== 'darwin') {
    return { schema: 'sks.menubar-uninstall.v1', ok: true, platform: process.platform, paths, actions: [], warnings: ['not_macos'], blockers: [] };
  }
  const launchctl = env.SKS_MENUBAR_LAUNCHCTL || await which('launchctl').catch(() => null) || await fallbackTool('/bin/launchctl');
  if (launchctl) {
    const service = launchServiceName();
    await runProcess(launchctl, ['bootout', service], { timeoutMs: 3_000, maxOutputBytes: 8 * 1024 }).catch(() => undefined);
    await runProcess(launchctl, ['bootout', launchDomain(), paths.launch_agent_path], { timeoutMs: 3_000, maxOutputBytes: 8 * 1024 }).catch(() => undefined);
    actions.push(`bootout ${LABEL}`);
  } else {
    warnings.push('launchctl_missing');
  }
  await terminateExistingMenuBarProcess(paths.executable_path);
  await fs.rm(paths.launch_agent_path, { force: true }).catch((err: any) => blockers.push(`remove_launch_agent_failed:${err?.message || err}`));
  await fs.rm(paths.install_dir, { recursive: true, force: true }).catch((err: any) => blockers.push(`remove_install_dir_failed:${err?.message || err}`));
  actions.push(`removed ${paths.launch_agent_path}`);
  actions.push(`removed ${paths.install_dir}`);
  const defaults = env.SKS_MENUBAR_DEFAULTS || await which('defaults').catch(() => null) || await fallbackTool('/usr/bin/defaults');
  if (defaults) {
    for (const key of [
      `NSStatusItem Preferred Position ${LABEL}`,
      `NSStatusItem Visible ${LABEL}`,
      `NSStatusItem VisibleCC ${LABEL}`
    ]) {
      await runProcess(defaults, ['delete', CONTROL_CENTER_DOMAIN, key], { timeoutMs: 3_000, maxOutputBytes: 8 * 1024 }).catch(() => undefined);
    }
    actions.push('removed Control Center status item defaults');
  } else {
    warnings.push('defaults_missing');
  }
  return { schema: 'sks.menubar-uninstall.v1', ok: blockers.length === 0, platform: process.platform, paths, actions, warnings, blockers };
}

async function fallbackTool(candidate: string): Promise<string | null> {
  return await exists(candidate).then((ok) => ok ? candidate : null).catch(() => null);
}

async function seedMenuBarPreferredPosition(env: NodeJS.ProcessEnv): Promise<{ ok: true } | { ok: false; warning: string }> {
  const defaults = env.SKS_MENUBAR_DEFAULTS || await which('defaults').catch(() => null) || await fallbackTool('/usr/bin/defaults');
  if (!defaults) return { ok: false, warning: 'defaults_missing_for_menubar_position_seed' };

  const writes = [
    ['write', CONTROL_CENTER_DOMAIN, `NSStatusItem Preferred Position ${LABEL}`, '-int', String(CONTROL_CENTER_PREFERRED_POSITION)],
    ['write', CONTROL_CENTER_DOMAIN, `NSStatusItem Visible ${LABEL}`, '-bool', 'true'],
    ['write', CONTROL_CENTER_DOMAIN, `NSStatusItem VisibleCC ${LABEL}`, '-bool', 'true']
  ];
  for (const args of writes) {
    const result = await runProcess(defaults, args, {
      timeoutMs: 10_000,
      maxOutputBytes: 16 * 1024
    }).catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }));
    if (result.code !== 0) return { ok: false, warning: 'menubar_position_seed_failed' };
  }
  return { ok: true };
}

/**
 * Refuse to auto-launch a menu bar app whose executable lives under a temp dir.
 * Release gates run in hermetic envs rooted at os.tmpdir()/SKS_TMP_DIR; without
 * this guard a gate could spawn a real GUI status item that leaks into the
 * user's live menu bar. This is defense-in-depth behind SKS_SKIP_SKS_MENUBAR_LAUNCH
 * and the home check.
 */
export function isMenuBarInstallPathUnderTempDir(target: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const resolved = path.resolve(target);
  const roots = new Set<string>();
  const addRoot = (value: string | undefined | null): void => {
    if (!value) return;
    const abs = path.resolve(value);
    roots.add(abs);
    if (abs.startsWith('/var/')) roots.add(path.resolve('/private', abs.slice(1)));
    else if (abs.startsWith('/private/var/')) roots.add(abs.replace('/private', ''));
  };
  addRoot(os.tmpdir());
  addRoot(env.TMPDIR);
  addRoot(env.SKS_TMP_DIR);
  for (const root of roots) {
    if (resolved === root) return true;
    const prefix = root.endsWith(path.sep) ? root : root + path.sep;
    if (resolved.startsWith(prefix)) return true;
  }
  return false;
}

function realUserHome(): string {
  try {
    const userHome = os.userInfo().homedir;
    if (userHome) return path.resolve(userHome);
  } catch {
    // Fall back below for platforms where userInfo is unavailable.
  }
  return path.resolve(os.homedir());
}

function packagedSksEntry(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..', 'bin', 'sks.js');
}

async function resolveSksEntryForInstall(input: {
  explicit?: string;
  root: string;
  home: string;
  env: NodeJS.ProcessEnv;
  actionScriptPath: string;
  warnings: string[];
}): Promise<SksMenuBarTargetCheck> {
  const packaged = packagedSksEntry();
  let resolved = input.explicit ? path.resolve(input.explicit) : packaged;
  let existsResolved = await exists(resolved);
  let projectLocal = isSubpath(resolved, input.root);
  if (projectLocal) {
    const globalCandidate = await findGlobalSksEntry(input.home, input.env, packaged);
    if (globalCandidate && globalCandidate !== resolved) {
      input.warnings.push('sks_entry_project_local_ignored_global_package_used');
      resolved = globalCandidate;
      existsResolved = true;
      projectLocal = isSubpath(resolved, input.root);
    } else {
      input.warnings.push('sks_entry_resolved_under_project_root');
    }
  }
  const usedPreviousScript = !existsResolved && await exists(input.actionScriptPath);
  if (!existsResolved && usedPreviousScript) input.warnings.push('sks_entry_unresolved_kept_previous_script');
  return {
    requested: input.explicit ? path.resolve(input.explicit) : null,
    resolved: existsResolved ? resolved : null,
    packaged,
    exists: existsResolved,
    project_local: projectLocal,
    used_previous_script: usedPreviousScript
  };
}

async function findGlobalSksEntry(home: string, env: NodeJS.ProcessEnv, packaged: string): Promise<string | null> {
  const candidates = new Set<string>();
  const nodeRoot = path.resolve(path.dirname(process.execPath), '..');
  candidates.add(path.join(nodeRoot, 'lib', 'node_modules', 'sneakoscope', 'dist', 'bin', 'sks.js'));
  candidates.add(path.join(home, '.nvm', 'versions', 'node'));
  const nvmRoot = path.join(home, '.nvm', 'versions', 'node');
  try {
    const versions = await fs.readdir(nvmRoot);
    for (const version of versions.sort().reverse()) {
      candidates.add(path.join(nvmRoot, version, 'lib', 'node_modules', 'sneakoscope', 'dist', 'bin', 'sks.js'));
    }
  } catch {}
  if (env.SKS_GLOBAL_ROOT) candidates.add(path.join(path.resolve(env.SKS_GLOBAL_ROOT), 'dist', 'bin', 'sks.js'));
  for (const candidate of candidates) {
    if (candidate === nvmRoot) continue;
    if (path.resolve(candidate) === path.resolve(packaged)) continue;
    if (await exists(candidate)) return path.resolve(candidate);
  }
  return null;
}

function actionScriptSource(input: { nodeBin: string; sksEntry: string }) {
  return `#!/bin/zsh
set -e
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
NODE_BIN=${shellQuote(input.nodeBin)}
SKS_ENTRY=${shellQuote(input.sksEntry)}
if [ -x "$NODE_BIN" ] && [ -f "$SKS_ENTRY" ]; then
  exec "$NODE_BIN" "$SKS_ENTRY" "$@"
fi
for cand in "$HOME"/.nvm/versions/node/*/bin/node(Nn[-1]); do
  if [ -x "$cand" ] && [ -f "$SKS_ENTRY" ]; then
    exec "$cand" "$SKS_ENTRY" "$@"
  fi
done
if /bin/zsh -lc 'command -v sks' >/dev/null 2>&1; then
  exec /bin/zsh -lc "sks $(printf '%q ' "$@")"
fi
echo "SKS command not found. Run npm install -g sneakoscope or sks doctor --fix, then try again." >&2
exit 127
`;
}

function swiftMenuSource(input: { actionScriptPath: string; buildStampPath: string; packageVersion: string }) {
  return `import Cocoa
import Foundation

let actionScript = ${swiftString(input.actionScriptPath)}
let buildStampPath = ${swiftString(input.buildStampPath)}
let packageVersion = ${swiftString(input.packageVersion)}

func shellQuote(_ value: String) -> String {
    return "'" + value.replacingOccurrences(of: "'", with: "'\\\\''") + "'"
}

func showAlert(_ message: String, informative: String = "") {
    DispatchQueue.main.async {
        let alert = NSAlert()
        alert.messageText = message
        alert.informativeText = informative
        alert.alertStyle = .warning
        alert.runModal()
    }
}

func runProcess(_ executable: String, _ args: [String] = [], completion: ((Int32, String) -> Void)? = nil) {
    let process = Process()
    let output = Pipe()
    process.executableURL = URL(fileURLWithPath: executable)
    process.arguments = args
    process.standardOutput = output
    process.standardError = output
    process.terminationHandler = { proc in
        let data = output.fileHandleForReading.readDataToEndOfFile()
        let text = String(data: data, encoding: .utf8) ?? ""
        completion?(proc.terminationStatus, text)
    }
    do {
        try process.run()
    } catch {
        completion?(-1, String(describing: error))
    }
}

func showNotification(_ title: String, _ body: String) {
    let clipped = String(body.prefix(700))
    let script = "display notification " + shellQuote(clipped) + " with title " + shellQuote(title)
    runProcess("/usr/bin/osascript", ["-e", script]) { code, output in
        if code != 0 {
            showAlert(title, informative: output)
        }
    }
}

func runInTerminal(_ command: String) {
    let commandWithExit = "printf '\\\\e]0;SKS\\\\a'; " + command + "; exit"
    let escaped = commandWithExit
        .replacingOccurrences(of: "\\\\", with: "\\\\\\\\")
        .replacingOccurrences(of: "\\\"", with: "\\\\\\\"")
    let script = """
tell application "Terminal"
  activate
  set sksWindow to missing value
  repeat with w in windows
    if name of w contains "SKS" then set sksWindow to w
  end repeat
  if sksWindow is missing value then
    do script "\\(escaped)"
  else
    do script "\\(escaped)" in selected tab of sksWindow
  end if
end tell
"""
    runProcess("/usr/bin/osascript", ["-e", script]) { code, output in
        if code != 0 {
            let denied = output.contains("-1743") || output.localizedCaseInsensitiveContains("not authorized")
            if denied {
                showAlert("SKS menu cannot control Terminal", informative: "Open System Settings > Privacy & Security > Automation, then allow SKS Menu Bar to control Terminal.")
            } else {
                showAlert("SKS menu action failed", informative: output)
            }
        }
    }
}

struct MenuState {
    let title: String
    let line: String
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem!
    var statusLineItem: NSMenuItem!
    var timer: Timer?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.autosaveName = "com.sneakoscope.sks-menubar"
        statusItem.isVisible = true
        if let button = statusItem.button {
            configureStatusButton(button, title: "SKS")
        }

        let menu = NSMenu()
        statusLineItem = NSMenuItem(title: "SKS v\\(packageVersion) - starting", action: nil, keyEquivalent: "")
        statusLineItem.isEnabled = false
        menu.addItem(statusLineItem)
        menu.addItem(NSMenuItem.separator())
        add(menu, "Use codex-lb", #selector(useCodexLb))
        add(menu, "Use ChatGPT OAuth", #selector(useChatGptOAuth))
        add(menu, "Set codex-lb Domain and Key", #selector(setCodexLbDomainAndKey))
        menu.addItem(NSMenuItem.separator())
        add(menu, "Set OpenRouter Key and GLM Profiles", #selector(setOpenRouterKey))
        add(menu, "Fast Check", #selector(fastCheck))
        add(menu, "SKS Version Check", #selector(sksVersionCheck))
        add(menu, "Update SKS Now", #selector(updateSksNow))
        menu.addItem(NSMenuItem.separator())
        add(menu, "Open Codex Settings", #selector(openCodexSettings))
        add(menu, "Restart Codex", #selector(restartCodex))
        menu.addItem(NSMenuItem.separator())
        add(menu, "Quit SKS Menu", #selector(quit))
        statusItem.menu = menu
        updateState()
        timer = Timer.scheduledTimer(withTimeInterval: 30.0, repeats: true) { [weak self] _ in self?.updateState() }
    }

    func configureStatusButton(_ button: NSStatusBarButton, title: String) {
        button.image = nil
        button.title = title
        let titleFont = NSFont.systemFont(ofSize: NSFont.systemFontSize, weight: .semibold)
        let titleAttributes: [NSAttributedString.Key: Any] = [
            .font: titleFont,
            .foregroundColor: NSColor.labelColor
        ]
        button.font = titleFont
        button.attributedTitle = NSAttributedString(string: title, attributes: titleAttributes)
        button.toolTip = "SKS - Sneakoscope Codex settings"
        button.setAccessibilityLabel(title)
        button.setAccessibilityHelp("Open SKS menu")
    }

    func add(_ menu: NSMenu, _ title: String, _ selector: Selector) {
        let item = NSMenuItem(title: title, action: selector, keyEquivalent: "")
        item.target = self
        menu.addItem(item)
    }

    func updateState() {
        let state = readMenuState()
        if let button = statusItem.button {
            configureStatusButton(button, title: state.title)
        }
        statusLineItem.title = state.line
    }

    func readMenuState() -> MenuState {
        let actionTargetOk = actionScriptTargetExists()
        if !actionTargetOk {
            return MenuState(title: "SKS ⚠", line: "SKS v\\(packageVersion) - action script broken (run sks doctor --fix)")
        }
        if updateAvailable() {
            return MenuState(title: "SKS ↑", line: "SKS v\\(packageVersion) - update available")
        }
        return MenuState(title: "SKS", line: "SKS v\\(packageVersion) - OK")
    }

    func actionScriptTargetExists() -> Bool {
        guard let text = try? String(contentsOfFile: actionScript, encoding: .utf8) else { return false }
        guard let entry = shellAssignment(text, key: "SKS_ENTRY") else { return false }
        return FileManager.default.fileExists(atPath: entry)
    }

    func updateAvailable() -> Bool {
        let cachePath = NSString(string: "~/.sneakoscope/cache/update-notice.json").expandingTildeInPath
        guard let data = FileManager.default.contents(atPath: cachePath) else { return false }
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return false }
        if let available = json["update_available"] as? Bool { return available }
        guard let latest = json["latest_version"] as? String else { return false }
        return latest != packageVersion && !latest.isEmpty
    }

    func shellAssignment(_ text: String, key: String) -> String? {
        for line in text.components(separatedBy: .newlines) {
            if line.hasPrefix(key + "=") {
                var value = String(line.dropFirst(key.count + 1))
                if value.hasPrefix("'") && value.hasSuffix("'") && value.count >= 2 {
                    value.removeFirst()
                    value.removeLast()
                    return value.replacingOccurrences(of: "'\\\\''", with: "'")
                }
                return value
            }
        }
        return nil
    }

    func runSksInTerminal(_ args: [String], tail: String = "echo; echo 'SKS command finished.'") {
        let quoted = args.map(shellQuote).joined(separator: " ")
        runInTerminal("\\(shellQuote(actionScript)) \\(quoted); \\(tail)")
    }

    func runSksBackground(_ args: [String], title: String) {
        runProcess(actionScript, args) { code, output in
            let status = code == 0 ? "OK" : "failed (\\(code))"
            showNotification(title, status + "\\n" + output)
        }
    }

    @objc func useCodexLb() {
        runSksInTerminal(["codex-lb", "use-codex-lb"])
    }

    @objc func useChatGptOAuth() {
        runSksInTerminal(["codex-lb", "use-oauth"])
    }

    @objc func setCodexLbDomainAndKey() {
        runSksInTerminal(["codex-lb", "setup"])
    }

    @objc func setOpenRouterKey() {
        let command = "printf 'Paste OpenRouter key, then press Return: '; read -r key; printf '%s\\\\n' \\"$key\\" | \\(shellQuote(actionScript)) codex-app set-openrouter-key --api-key-stdin; \\(shellQuote(actionScript)) codex-app glm-profile install; echo; echo 'OpenRouter/GLM update finished. Restart Codex if the model picker was already open.'"
        runInTerminal(command)
    }

    @objc func fastCheck() {
        runSksBackground(["codex-lb", "fast-check"], title: "SKS Fast Check")
    }

    @objc func sksVersionCheck() {
        runSksBackground(["update", "check"], title: "SKS Version Check")
    }

    @objc func updateSksNow() {
        runSksInTerminal(["update"], tail: "echo; echo 'SKS update finished.'")
    }

    @objc func openCodexSettings() {
        runProcess("/usr/bin/open", ["codex://settings"])
    }

    @objc func restartCodex() {
        runInTerminal("/usr/bin/osascript -e 'tell application \\"Codex\\" to quit'; sleep 1; /usr/bin/open -a Codex; echo 'Codex restart requested.'")
    }

    @objc func quit() {
        NSApplication.shared.terminate(nil)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
`;
}

function infoPlistSource(version: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>SKSMenuBar</string>
  <key>CFBundleIdentifier</key>
  <string>${LABEL}</string>
  <key>CFBundleName</key>
  <string>SKS Menu Bar</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${escapeXml(version)}</string>
  <key>CFBundleVersion</key>
  <string>${escapeXml(version)}</string>
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>
`;
}

function launchAgentSource(executablePath: string, installDir: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(executablePath)}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>ProcessType</key>
  <string>Interactive</string>
  <key>StandardOutPath</key>
  <string>${escapeXml(path.join(installDir, 'menubar.out.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(path.join(installDir, 'menubar.err.log'))}</string>
</dict>
</plist>
`;
}

async function buildMenuBarAppAtomically(input: {
  paths: ReturnType<typeof sksMenuBarPaths>;
  swiftc: string;
  codesign: string | null;
  swiftSource: string;
  infoPlist: string;
  actions: string[];
}) {
  await fs.rm(input.paths.staging_app_path, { recursive: true, force: true });
  await ensureDir(path.join(input.paths.staging_app_path, 'Contents', 'MacOS'));
  await writeTextAtomic(input.paths.source_path, input.swiftSource);
  input.actions.push(`wrote ${input.paths.source_path}`);
  await writeTextAtomic(path.join(input.paths.staging_app_path, 'Contents', 'Info.plist'), input.infoPlist);
  const stagingExecutable = path.join(input.paths.staging_app_path, 'Contents', 'MacOS', 'SKSMenuBar');
  const compile = await runProcess(input.swiftc, ['-framework', 'Cocoa', input.paths.source_path, '-o', stagingExecutable], {
    timeoutMs: 60_000,
    maxOutputBytes: 64 * 1024
  }).catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }));
  if (compile.code !== 0) {
    throw new MenuBarBuildError('swift_compile_failed', String(compile.stderr || compile.stdout || '').trim());
  }
  await fs.chmod(stagingExecutable, 0o755).catch(() => undefined);
  input.actions.push(`compiled ${stagingExecutable}`);
  if (input.codesign) {
    const signed = await runProcess(input.codesign, ['--force', '--sign', '-', '--identifier', LABEL, input.paths.staging_app_path], {
      timeoutMs: 20_000,
      maxOutputBytes: 32 * 1024
    }).catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }));
    if (signed.code !== 0) {
      throw new MenuBarBuildError('codesign_failed', String(signed.stderr || signed.stdout || '').trim());
    }
    input.actions.push(`codesigned ${input.paths.staging_app_path}`);
  }
  await fs.rm(input.paths.backup_app_path, { recursive: true, force: true }).catch(() => undefined);
  if (await exists(input.paths.app_path)) await fs.rename(input.paths.app_path, input.paths.backup_app_path);
  try {
    await fs.rename(input.paths.staging_app_path, input.paths.app_path);
  } catch (err) {
    if (await exists(input.paths.backup_app_path)) await fs.rename(input.paths.backup_app_path, input.paths.app_path).catch(() => undefined);
    throw err;
  }
  await fs.rm(input.paths.backup_app_path, { recursive: true, force: true }).catch(() => undefined);
  input.actions.push(`installed ${input.paths.app_path}`);
}

async function launchWithLaunchctl(input: {
  launchctl: string;
  open: string | null;
  paths: ReturnType<typeof sksMenuBarPaths>;
  skipIfRunning?: boolean;
}): Promise<NonNullable<SksMenuBarInstallResult['launch']>> {
  const service = launchServiceName();
  const domain = launchDomain();
  const stdio = {
    stdoutFile: path.join(input.paths.install_dir, 'launchctl.out.log'),
    stderrFile: path.join(input.paths.install_dir, 'launchctl.err.log')
  };
  const already = await waitForLaunchctlRunning(input.launchctl, service);
  if (input.skipIfRunning && already.running) {
    return { requested: true, method: 'launchctl', ok: true, print_code: already.code, error: null };
  }
  await runProcess(input.launchctl, ['bootout', service], { timeoutMs: 3_000, maxOutputBytes: 8 * 1024, ...stdio }).catch(() => undefined);
  await runProcess(input.launchctl, ['bootout', domain, input.paths.launch_agent_path], { timeoutMs: 3_000, maxOutputBytes: 8 * 1024, ...stdio }).catch(() => undefined);
  await terminateExistingMenuBarProcess(input.paths.executable_path);
  const bootstrap = await runProcess(input.launchctl, ['bootstrap', domain, input.paths.launch_agent_path], {
    timeoutMs: 5_000,
    maxOutputBytes: 16 * 1024,
    ...stdio
  }).catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }));
  if (bootstrap.code === 0) {
    const kickstart = await runProcess(input.launchctl, ['kickstart', '-k', service], {
      timeoutMs: 3_000,
      maxOutputBytes: 16 * 1024,
      ...stdio
    }).catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }));
    if (kickstart.code !== 0) {
      const printed = await waitForLaunchctlRunning(input.launchctl, service);
      if (printed.running) {
        return {
          requested: true,
          method: 'launchctl',
          ok: true,
          bootstrap_code: bootstrap.code,
          kickstart_code: kickstart.code,
          print_code: printed.code,
          error: null
        };
      }
    }
    return {
      requested: true,
      method: 'launchctl',
      ok: kickstart.code === 0,
      bootstrap_code: bootstrap.code,
      kickstart_code: kickstart.code,
      error: kickstart.code === 0 ? null : String(kickstart.stderr || kickstart.stdout || '').trim() || 'launchctl_kickstart_failed'
    };
  }
  if (input.open) {
    const opened = await runProcess(input.open, [input.paths.app_path], {
      timeoutMs: 5_000,
      maxOutputBytes: 16 * 1024,
      ...stdio
    }).catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }));
    return {
      requested: true,
      method: 'open-fallback',
      ok: opened.code === 0,
      bootstrap_code: bootstrap.code,
      open_code: opened.code,
      error: opened.code === 0
        ? null
        : String(opened.stderr || opened.stdout || bootstrap.stderr || bootstrap.stdout || '').trim() || 'sks_menubar_launch_failed'
    };
  }
  return {
    requested: true,
    method: 'launchctl',
    ok: false,
    bootstrap_code: bootstrap.code,
    error: String(bootstrap.stderr || bootstrap.stdout || '').trim() || 'launchctl_bootstrap_failed'
  };
}

async function waitForLaunchctlRunning(launchctl: string, service: string): Promise<{ code: number | null; running: boolean }> {
  let lastCode: number | null = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const printed = await runProcess(launchctl, ['print', service], {
      timeoutMs: 1_000,
      maxOutputBytes: 32 * 1024
    }).catch(() => ({ code: 1, stdout: '', stderr: '' }));
    lastCode = printed.code;
    if (printed.code === 0 && /\bstate = running\b|\bpid = \d+\b/.test(`${printed.stdout || ''}\n${printed.stderr || ''}`)) {
      return { code: printed.code, running: true };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return { code: lastCode, running: false };
}

async function terminateExistingMenuBarProcess(executablePath: string): Promise<void> {
  const pkill = await which('pkill').catch(() => null) || await fallbackTool('/usr/bin/pkill');
  if (!pkill) return;
  await runProcess(pkill, ['-f', executablePath], { timeoutMs: 3_000, maxOutputBytes: 8 * 1024 }).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 150));
}

async function isMenuBarProcessRunning(executablePath: string): Promise<boolean> {
  const pgrep = await which('pgrep').catch(() => null) || await fallbackTool('/usr/bin/pgrep');
  if (!pgrep) return false;
  const result = await runProcess(pgrep, ['-f', executablePath], { timeoutMs: 2_000, maxOutputBytes: 8 * 1024 })
    .catch(() => ({ code: 1, stdout: '', stderr: '' }));
  return result.code === 0;
}

async function inspectLaunchdService(env: NodeJS.ProcessEnv = process.env): Promise<SksMenuBarStatusResult['launchd']> {
  if (process.platform !== 'darwin') return { checked: false, ok: true, service: null, state: null, pid: null, error: null };
  const launchctl = env.SKS_MENUBAR_LAUNCHCTL || await which('launchctl').catch(() => null) || await fallbackTool('/bin/launchctl');
  if (!launchctl) return { checked: true, ok: false, service: launchServiceName(), state: null, pid: null, error: 'launchctl_missing' };
  const service = launchServiceName();
  const result = await runProcess(launchctl, ['print', service], { timeoutMs: 2_000, maxOutputBytes: 32 * 1024 })
    .catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }));
  const text = `${result.stdout || ''}\n${result.stderr || ''}`;
  const state = text.match(/\bstate = ([^\n]+)/)?.[1]?.trim() || null;
  const pidText = text.match(/\bpid = (\d+)/)?.[1] || null;
  return {
    checked: true,
    ok: result.code === 0,
    service,
    state,
    pid: pidText ? Number(pidText) : null,
    error: result.code === 0 ? null : String(result.stderr || result.stdout || '').trim()
  };
}

async function inspectSignature(appPath: string, env: NodeJS.ProcessEnv = process.env): Promise<SksMenuBarStatusResult['signature']> {
  if (process.platform !== 'darwin') return { checked: false, identifier: null, ok: true, error: null };
  const codesign = env.SKS_MENUBAR_CODESIGN || await which('codesign').catch(() => null) || await fallbackTool('/usr/bin/codesign');
  if (!codesign) return { checked: true, identifier: null, ok: false, error: 'codesign_missing' };
  if (!(await exists(appPath))) return { checked: true, identifier: null, ok: false, error: 'app_missing' };
  const result = await runProcess(codesign, ['-dv', '--verbose=4', appPath], { timeoutMs: 5_000, maxOutputBytes: 32 * 1024 })
    .catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }));
  const text = `${result.stdout || ''}\n${result.stderr || ''}`;
  const identifier = text.match(/\bIdentifier=([^\n]+)/)?.[1]?.trim() || null;
  return {
    checked: true,
    identifier,
    ok: result.code === 0 && identifier === LABEL,
    error: result.code === 0 ? null : String(result.stderr || result.stdout || '').trim()
  };
}

async function xcodeCltStatus(xcodeSelect: string | null): Promise<{ ok: boolean; error?: string }> {
  if (!xcodeSelect) return { ok: false, error: 'xcode-select not found; run xcode-select --install' };
  const result = await runProcess(xcodeSelect, ['-p'], { timeoutMs: 5_000, maxOutputBytes: 8 * 1024 })
    .catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }));
  return result.code === 0
    ? { ok: true }
    : { ok: false, error: String(result.stderr || result.stdout || 'Run: xcode-select --install').trim() };
}

async function toolVersion(tool: string, args: string[]): Promise<string> {
  const result = await runProcess(tool, args, { timeoutMs: 5_000, maxOutputBytes: 16 * 1024 })
    .catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }));
  return result.code === 0 ? String(result.stdout || result.stderr || '').trim().split(/\r?\n/)[0] || 'unknown' : 'unknown';
}

function buildStampEquals(left: SksMenuBarBuildStamp | null | undefined, right: SksMenuBarBuildStamp): boolean {
  return Boolean(left
    && left.schema === right.schema
    && left.package_version === right.package_version
    && left.source_sha256 === right.source_sha256
    && left.action_script_sha256 === right.action_script_sha256
    && left.info_plist_sha256 === right.info_plist_sha256
    && left.launch_agent_sha256 === right.launch_agent_sha256
    && left.swiftc_version === right.swiftc_version
    && left.codesign_identifier === right.codesign_identifier);
}

async function isExecutable(file: string): Promise<boolean> {
  try {
    await fs.access(file, 1);
    return true;
  } catch {
    return false;
  }
}

function shellAssignment(text: string, key: string): string | null {
  const line = String(text || '').split(/\r?\n/).find((row) => row.startsWith(`${key}=`));
  if (!line) return null;
  return shellUnquote(line.slice(key.length + 1));
}

function shellUnquote(value: string): string {
  const text = String(value || '').trim();
  if (text.startsWith("'") && text.endsWith("'")) return text.slice(1, -1).replace(/'\\''/g, "'");
  if (text.startsWith('"') && text.endsWith('"')) return text.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  return text;
}

function launchDomain(): string {
  const uid = typeof process.getuid === 'function' ? process.getuid() : null;
  return uid === null ? 'gui' : `gui/${uid}`;
}

function launchServiceName(): string {
  return `${launchDomain()}/${LABEL}`;
}

function defaultNextActions(): string[] {
  return [
    'Run: sks menubar status',
    'Run: sks menubar install',
    'Run: sks menubar restart',
    'Run: sks menubar uninstall',
    'Rotate CODEX_LB_API_KEY and OPENROUTER_API_KEY if they were previously exposed in launchd.'
  ];
}

async function writeReport(reportPath: string, result: SksMenuBarInstallResult): Promise<void> {
  try {
    await writeJsonAtomic(reportPath, result);
  } catch (err: any) {
    result.report_write_failed = true;
    console.error(`warning: failed to write SKS menubar report ${reportPath}: ${err?.message || err}`);
  }
}

function isSubpath(candidate: string, root: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(candidate));
  return rel === '' || (Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel));
}

function swiftString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

class MenuBarBuildError extends Error {
  blocker: string;

  constructor(blocker: string, message: string) {
    super(message);
    this.blocker = blocker;
  }
}
