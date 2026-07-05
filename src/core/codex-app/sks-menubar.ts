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
import { findCodexApp } from '../codex-app.js';
import { withHeartbeat } from '../../cli/cli-theme.js';

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
  config_path?: string | null;
  report_path: string | null;
  codex_bundle_id?: string | null;
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
  quiet?: boolean;
}

export interface SecretLaunchEnvCleanupResult {
  ok: boolean;
  status: 'cleaned' | 'skipped' | 'not_macos' | 'launchctl_missing' | 'partial';
  variables: string[];
  cleaned: string[];
  failed: Array<{ key: string; error: string }>;
  next_actions: string[];
}

export interface SksMenuBarConfig {
  schema: 'sks.sks-menubar-config.v1';
  codex_bundle_id: string | null;
  quit_with_codex: boolean;
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
    smoke_code: number | null;
    smoke_output: string | null;
    version_detected: boolean;
    executable: boolean;
    ok: boolean;
  };
  codex_sync: {
    ok: boolean;
    bundle_id: string | null;
    codex_running: boolean | null;
    icon_visible_expected: boolean;
    warning: string | null;
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
  'Open Dashboard',
  'Open Codex Settings',
  'Restart Codex',
  'View Last Log',
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
    config_path: path.join(installDir, 'config.json'),
    launch_agent_path: path.join(home, 'Library', 'LaunchAgents', `${LABEL}.plist`),
    report_path: path.join(root, '.sneakoscope', 'reports', 'sks-menubar.json'),
    stdout_log_path: path.join(installDir, 'menubar.out.log'),
    stderr_log_path: path.join(installDir, 'menubar.err.log'),
    logs_dir: path.join(installDir, 'logs'),
    last_action_log_path: path.join(installDir, 'logs', 'last-action.log')
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
  let codexBundleId: string | null = null;

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
      config_path: null,
      report_path: apply ? paths.report_path : null,
      codex_bundle_id: null,
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
    const statusWarnings = [...(status?.warnings || []), ...(launchAgent ? [] : ['launch_agent_not_installed_yet'])];
    return {
      schema: 'sks.codex-app-sks-menubar.v1',
      ok: status ? status.ok === true : true,
      apply,
      status: 'planned',
      platform: process.platform,
      app_path: paths.app_path,
      executable_path: paths.executable_path,
      launch_agent_path: paths.launch_agent_path,
      action_script_path: paths.action_script_path,
      build_stamp_path: paths.build_stamp_path,
      config_path: paths.config_path,
      report_path: paths.report_path,
      codex_bundle_id: status?.codex_sync.bundle_id || null,
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
      blockers: status?.blockers || [],
      warnings: statusWarnings
    };
  }

  await ensureDir(paths.install_dir);
  await ensureDir(paths.logs_dir);
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
  const clt = await xcodeCltStatus(xcodeSelect);
  if (!clt.ok) return await blockedResult('xcode_clt_missing', clt.error || 'Xcode Command Line Tools missing');
  if (!swiftc) return await blockedResult('swiftc_missing', 'swiftc not found');
  const swiftcVersion = await toolVersion(swiftc, ['--version']);
  codexBundleId = await resolveCodexBundleId({ home: paths.home, env, warnings });
  if (!codexBundleId) warnings.push('codex_app_bundle_id_unresolved');
  const config = await writeDefaultMenuBarConfig(paths.config_path, codexBundleId);
  actions.push(`wrote ${paths.config_path}`);

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
    configPath: paths.config_path,
    lastActionLogPath: paths.last_action_log_path,
    codexBundleId: config.codex_bundle_id,
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
      actions.push(`wrote ${paths.action_script_path}`);
    }
  }

  // The Swift app executes the action script DIRECTLY (Process.executableURL points at the
  // script itself), so a lost executable bit breaks every menu action even when the script
  // content is current. Re-assert the bit on every install run — including the up-to-date
  // fast path, which previously never touched permissions and therefore could never repair
  // a 0644 script — and surface chmod failures instead of swallowing them.
  if (await exists(paths.action_script_path)) {
    const previouslyExecutable = await fs.access(paths.action_script_path, fs.constants.X_OK).then(() => true).catch(() => false);
    const chmodError = await fs.chmod(paths.action_script_path, 0o755).then(() => null).catch((err: any) => (err?.message ? String(err.message) : String(err)));
    if (chmodError) {
      warnings.push(`action_script_chmod_failed:${chmodError}`);
    } else if (!previouslyExecutable) {
      actions.push('restored action script executable bit');
    }
  }

  if (!stampMatches && !binaryStable) {
    try {
      await buildMenuBarAppAtomically({
        paths,
        swiftc,
        codesign,
        swiftSource,
        infoPlist,
        actions,
        quiet: opts.quiet === true
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
    ? await launchWithLaunchctl({ launchctl, open, paths, skipIfRunning: stampMatches, quiet: opts.quiet === true })
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
    config_path: paths.config_path,
    report_path: paths.report_path,
    codex_bundle_id: codexBundleId,
    menu_items: MENU_ITEMS,
    actions,
    launch,
    target_check: target,
    build_stamp: stamp,
    tcc_automation_status: 'unknown',
    secret_env_cleanup: secretEnvCleanup,
    next_actions: nextActions,
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
      config_path: paths.config_path,
      report_path: paths.report_path,
      codex_bundle_id: typeof codexBundleId === 'string' ? codexBundleId : null,
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

async function writeDefaultMenuBarConfig(configPath: string, codexBundleId: string | null): Promise<SksMenuBarConfig> {
  const previous = await readMenuBarConfig(configPath);
  const config: SksMenuBarConfig = {
    schema: 'sks.sks-menubar-config.v1',
    codex_bundle_id: codexBundleId,
    quit_with_codex: previous.quit_with_codex === true
  };
  await writeJsonAtomic(configPath, config);
  return config;
}

async function readMenuBarConfig(configPath: string): Promise<SksMenuBarConfig> {
  const config = await readJson<Partial<SksMenuBarConfig> | null>(configPath, null);
  return {
    schema: 'sks.sks-menubar-config.v1',
    codex_bundle_id: typeof config?.codex_bundle_id === 'string' && config.codex_bundle_id.trim()
      ? config.codex_bundle_id.trim()
      : null,
    quit_with_codex: config?.quit_with_codex === true
  };
}

async function resolveCodexBundleId(input: { home: string; env: NodeJS.ProcessEnv; warnings: string[] }): Promise<string | null> {
  if (process.platform !== 'darwin') return null;
  const appPath = await findCodexApp({ home: input.home, env: input.env }).catch(() => null);
  if (!appPath) {
    input.warnings.push('codex_app_not_found_for_bundle_sync');
    return null;
  }
  const mdls = input.env.SKS_MENUBAR_MDLS || await which('mdls').catch(() => null) || await fallbackTool('/usr/bin/mdls');
  if (mdls) {
    const result = await runProcess(mdls, ['-name', 'kMDItemCFBundleIdentifier', '-raw', appPath], {
      timeoutMs: 3_000,
      maxOutputBytes: 8 * 1024
    }).catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }));
    const value = String(result.stdout || '').trim();
    if (result.code === 0 && value && value !== '(null)' && value !== 'null') return value;
  }
  const defaults = input.env.SKS_MENUBAR_DEFAULTS || await which('defaults').catch(() => null) || await fallbackTool('/usr/bin/defaults');
  if (defaults) {
    const result = await runProcess(defaults, ['read', path.join(appPath, 'Contents', 'Info'), 'CFBundleIdentifier'], {
      timeoutMs: 3_000,
      maxOutputBytes: 8 * 1024
    }).catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }));
    const value = String(result.stdout || '').trim();
    if (result.code === 0 && value) return value;
  }
  return null;
}

export async function smokeSksMenuBarAction(actionScriptPath: string): Promise<{ ok: boolean; code: number | null; output: string | null; versionDetected: boolean; executable: boolean }> {
  if (!(await exists(actionScriptPath))) return { ok: false, code: null, output: null, versionDetected: false, executable: false };
  // The Swift app runs the script directly (which requires the executable bit), so the smoke
  // check must invoke it the same way. Running it via `/bin/zsh <script>` — as this check used
  // to — succeeds even when +x is missing, which let doctor/status report a healthy action
  // target while the menu bar itself was showing "action script broken".
  const executable = await fs.access(actionScriptPath, fs.constants.X_OK).then(() => true).catch(() => false);
  if (!executable) {
    return {
      ok: false,
      code: null,
      output: 'action script is not executable (missing +x); the menu bar app cannot run it',
      versionDetected: false,
      executable: false
    };
  }
  const result = await runProcess(actionScriptPath, ['version'], {
    timeoutMs: 5_000,
    maxOutputBytes: 16 * 1024
  }).catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }));
  const output = String(`${result.stdout || ''}\n${result.stderr || ''}`).trim();
  const versionDetected = /\b(?:sks|sneakoscope)?\s*v?\d+\.\d+\.\d+\b/i.test(output);
  return {
    ok: result.code === 0 && versionDetected,
    code: result.code,
    output: output ? output.slice(0, 700) : null,
    versionDetected,
    executable: true
  };
}

async function isCodexAppRunningByBundleId(bundleId: string, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  if (process.platform !== 'darwin' || !bundleId) return false;
  const osascript = env.SKS_MENUBAR_OSASCRIPT || await which('osascript').catch(() => null) || await fallbackTool('/usr/bin/osascript');
  if (!osascript) return false;
  const result = await runProcess(osascript, ['-e', `application id "${bundleId.replace(/"/g, '\\"')}" is running`], {
    timeoutMs: 2_000,
    maxOutputBytes: 8 * 1024
  }).catch(() => ({ code: 1, stdout: '', stderr: '' }));
  return result.code === 0 && String(result.stdout || '').trim().toLowerCase() === 'true';
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
  const actionSmoke = await smokeSksMenuBarAction(paths.action_script_path);
  const config = await readMenuBarConfig(paths.config_path);
  const codexRunning = config.codex_bundle_id ? await isCodexAppRunningByBundleId(config.codex_bundle_id, opts.env) : null;
  const codexSync = {
    ok: Boolean(config.codex_bundle_id),
    bundle_id: config.codex_bundle_id,
    codex_running: codexRunning,
    icon_visible_expected: config.codex_bundle_id ? codexRunning === true : true,
    warning: config.codex_bundle_id ? null : 'codex_sync_disabled'
  };
  const buildStamp = await readJson<SksMenuBarBuildStamp | null>(paths.build_stamp_path, null);
  const launchd = await inspectLaunchdService(opts.env);
  const signature = await inspectSignature(paths.app_path, opts.env);
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!installed) blockers.push('menubar_app_missing');
  if (installed && launchd.checked && !launchd.ok) blockers.push('launchd_not_running');
  if (installed && !actionSmoke.executable) blockers.push('action_script_not_executable');
  if (installed && !actionSmoke.ok) blockers.push('action_script_smoke_failed');
  if (installed && signature.checked && !signature.ok) warnings.push('codesign_identifier_unexpected');
  if (!codexSync.ok) warnings.push('codex_sync_disabled');
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
      smoke_code: actionSmoke.code,
      smoke_output: actionSmoke.output,
      version_detected: actionSmoke.versionDetected,
      executable: actionSmoke.executable,
      ok: actionSmoke.ok
    },
    codex_sync: codexSync,
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
    input.warnings.push('sks_entry_project_local');
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

export function actionScriptSource(input: { nodeBin: string; sksEntry: string }) {
  return `#!/bin/zsh
set -e
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
# launchd starts this app with cwd=/. sks treats an unmarked cwd as the project
# root fallback, and / is neither writable nor a workspace, so give every
# menu-bar-spawned command a sane home-directory cwd instead.
cd "$HOME" 2>/dev/null || true
# Menu-bar actions operate on global state (~/.codex, keychain, launchd), never
# on a project, so the per-project update-migration gate must not fire here —
# it would otherwise treat $HOME as a project and run a migration doctor in it.
export SKS_UPDATE_MIGRATION_GATE_DISABLED=1
NODE_BIN=${shellQuote(input.nodeBin)}
SKS_ENTRY=${shellQuote(input.sksEntry)}

notify_sks_missing() {
  /usr/bin/osascript -e 'display notification "sks CLI를 찾을 수 없습니다. sks doctor --fix 또는 npm install -g sneakoscope 실행 후 다시 시도하세요." with title "SKS Menu Bar"' >/dev/null 2>&1 || true
}

resolve_node_bin() {
  if [ -x "$NODE_BIN" ]; then
    printf '%s\\n' "$NODE_BIN"
    return 0
  fi
  local login_node
  login_node="$(/bin/zsh -lc 'command -v node' 2>/dev/null | /usr/bin/head -n 1 || true)"
  if [ -n "$login_node" ] && [ -x "$login_node" ]; then
    printf '%s\\n' "$login_node"
    return 0
  fi
  for cand in "$HOME"/.nvm/versions/node/*/bin/node(Nn[-1]) /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do
    if [ -x "$cand" ]; then
      printf '%s\\n' "$cand"
      return 0
    fi
  done
  return 1
}

run_node_entry() {
  local entry="$1"
  shift
  if [ ! -f "$entry" ]; then
    return 1
  fi
  local node_bin
  node_bin="$(resolve_node_bin || true)"
  if [ -z "$node_bin" ]; then
    return 1
  fi
  exec "$node_bin" "$entry" "$@"
}

SKS_BIN="$(/bin/zsh -lc 'command -v sks' 2>/dev/null | /usr/bin/head -n 1 || true)"
if [ -n "$SKS_BIN" ] && [ -x "$SKS_BIN" ]; then
  exec "$SKS_BIN" "$@"
fi

NPM_ROOT="$(/bin/zsh -lc 'npm root -g' 2>/dev/null | /usr/bin/head -n 1 || true)"
if [ -n "$NPM_ROOT" ]; then
  run_node_entry "$NPM_ROOT/sneakoscope/dist/bin/sks.js" "$@" || true
fi

for entry in "$HOME"/.nvm/versions/node/*/lib/node_modules/sneakoscope/dist/bin/sks.js(Nn[-1]) /opt/homebrew/lib/node_modules/sneakoscope/dist/bin/sks.js /usr/local/lib/node_modules/sneakoscope/dist/bin/sks.js; do
  if [ -f "$entry" ]; then
    run_node_entry "$entry" "$@" || true
  fi
done
run_node_entry "$SKS_ENTRY" "$@" || true
notify_sks_missing
echo "SKS command not found. Run npm install -g sneakoscope or sks doctor --fix, then try again." >&2
exit 127
`;
}

export function swiftMenuSource(input: { actionScriptPath: string; buildStampPath: string; configPath: string; lastActionLogPath: string; codexBundleId: string | null; packageVersion: string }) {
  const codexLifecycleSource = input.codexBundleId ? `
    func configureCodexLifecycleSync() {
        setIconVisible(isCodexRunning())
        let center = NSWorkspace.shared.notificationCenter
        center.addObserver(self, selector: #selector(workspaceAppLaunched(_:)), name: NSWorkspace.didLaunchApplicationNotification, object: nil)
        center.addObserver(self, selector: #selector(workspaceAppTerminated(_:)), name: NSWorkspace.didTerminateApplicationNotification, object: nil)
    }

    @objc func workspaceAppLaunched(_ notification: Notification) {
        guard let app = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication else { return }
        if app.bundleIdentifier == codexBundleId {
            setIconVisible(true)
            updateState()
        }
    }

    @objc func workspaceAppTerminated(_ notification: Notification) {
        guard let app = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication else { return }
        if app.bundleIdentifier == codexBundleId {
            if quitWithCodex {
                NSApplication.shared.terminate(nil)
            } else {
                setIconVisible(false)
            }
        }
    }

    func setIconVisible(_ visible: Bool) {
        statusItem.isVisible = visible
        if visible {
            reassertControlCenterVisibility()
        }
    }

    func isCodexRunning() -> Bool {
        guard let bundle = codexBundleId else { return true }
        return NSWorkspace.shared.runningApplications.contains { $0.bundleIdentifier == bundle }
    }
` : `
    func configureCodexLifecycleSync() {
        setIconVisible(true)
        statusLineItem.title = "Codex app not detected — sync disabled"
    }

    func setIconVisible(_ visible: Bool) {
        statusItem.isVisible = visible
        if visible {
            reassertControlCenterVisibility()
        }
    }

    func isCodexRunning() -> Bool {
        return true
    }
`;
  return `import Cocoa
import Foundation

let actionScript = ${swiftString(input.actionScriptPath)}
let buildStampPath = ${swiftString(input.buildStampPath)}
let menubarConfigPath = ${swiftString(input.configPath)}
let lastActionLogPath = ${swiftString(input.lastActionLogPath)}
let codexBundleId: String? = ${input.codexBundleId ? swiftString(input.codexBundleId) : 'nil'}
let packageVersion = ${swiftString(input.packageVersion)}
let menuBarLabel = ${swiftString(SKS_MENUBAR_LABEL)}
let controlCenterDomain = ${swiftString(CONTROL_CENTER_DOMAIN)}

/// macOS persists status-item visibility hints per-label in Control Center's
/// defaults domain (see installSksMenuBar's seedMenuBarPreferredPosition).
/// Toggling NSStatusItem.isVisible back to true inside a resident process is
/// not always sufficient to make Control Center re-render a previously
/// hidden item, so re-show must reassert the same Control Center defaults
/// the installer seeds, or the icon can stay invisible after a Codex
/// quit/relaunch cycle even though isVisible is technically true again.
func reassertControlCenterVisibility() {
    let defaultsBin = "/usr/bin/defaults"
    guard FileManager.default.isExecutableFile(atPath: defaultsBin) else { return }
    let writes: [[String]] = [
        ["write", controlCenterDomain, "NSStatusItem Visible \\(menuBarLabel)", "-bool", "true"],
        ["write", controlCenterDomain, "NSStatusItem VisibleCC \\(menuBarLabel)", "-bool", "true"]
    ]
    for args in writes {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: defaultsBin)
        process.arguments = args
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        try? process.run()
    }
}

func clipped(_ value: String, limit: Int = 700) -> String {
    return String(value.prefix(limit))
}

// sks commands report failures as JSON ({reason|status|error|blockers[]|guidance[]}
// as short snake_case codes), which read as opaque "error codes" if dumped raw into
// an alert. Extract the readable parts and translate known codes into plain English;
// unknown codes fall back to "snake_case -> Words" rather than staying cryptic, and
// genuinely non-JSON output (already plain text) passes through unchanged.
func humanizeSksFailure(_ text: String) -> String {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let data = trimmed.data(using: .utf8),
          let obj = try? JSONSerialization.jsonObject(with: data, options: []) as? [String: Any] else {
        return text
    }
    var lines: [String] = []
    if let reason = obj["reason"] as? String {
        lines.append(humanizeSksCode(reason))
    } else if let status = obj["status"] as? String, !["ok", "pass", "verified", "verified_partial"].contains(status) {
        lines.append(humanizeSksCode(status))
    }
    if let errorMessage = obj["error"] as? String, !errorMessage.isEmpty {
        lines.append(errorMessage)
    }
    if let blockers = obj["blockers"] as? [String], !blockers.isEmpty {
        lines.append(contentsOf: blockers.map { "- " + humanizeSksCode($0) })
    }
    if let guidance = obj["guidance"] as? [String], !guidance.isEmpty {
        lines.append("")
        lines.append(contentsOf: guidance)
    }
    return lines.isEmpty ? text : lines.joined(separator: "\\n")
}

func humanizeSksCode(_ code: String) -> String {
    let known: [String: String] = [
        "missing_host_or_base_url": "No domain or base URL was entered.",
        "missing_api_key": "No API key was entered.",
        "setup_needed": "codex-lb is not configured yet.",
        "cancelled": "Setup was cancelled.",
        "process_only_cancelled": "Setup was cancelled (process-only mode was not confirmed).",
        "process_only_requires_yes": "This setup would only be kept for the current session — nothing durable was saved."
    ]
    if let mapped = known[code] { return mapped }
    let words = code.split(separator: "_").joined(separator: " ")
    guard let first = words.first else { return code }
    return String(first).uppercased() + words.dropFirst()
}

func showAlert(_ message: String, informative: String = "") {
    DispatchQueue.main.async {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = message
        alert.informativeText = clipped(informative)
        alert.alertStyle = .warning
        alert.runModal()
    }
}

func promptText(title: String, message: String, placeholder: String = "", secure: Bool = false) -> String? {
    NSApp.activate(ignoringOtherApps: true)
    let alert = NSAlert()
    alert.messageText = title
    alert.informativeText = message
    alert.addButton(withTitle: "OK")
    alert.addButton(withTitle: "Cancel")
    let field: NSTextField = secure ? NSSecureTextField(frame: NSRect(x: 0, y: 0, width: 320, height: 24)) : NSTextField(frame: NSRect(x: 0, y: 0, width: 320, height: 24))
    field.placeholderString = placeholder
    alert.accessoryView = field
    let response = alert.runModal()
    if response != .alertFirstButtonReturn { return nil }
    let value = field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
    return value.isEmpty ? nil : value
}

func promptChoice(title: String, message: String, options: [String]) -> String? {
    NSApp.activate(ignoringOtherApps: true)
    let alert = NSAlert()
    alert.messageText = title
    alert.informativeText = message
    alert.addButton(withTitle: "OK")
    alert.addButton(withTitle: "Cancel")
    let popup = NSPopUpButton(frame: NSRect(x: 0, y: 0, width: 320, height: 26), pullsDown: false)
    popup.addItems(withTitles: options)
    alert.accessoryView = popup
    let response = alert.runModal()
    if response != .alertFirstButtonReturn { return nil }
    return popup.titleOfSelectedItem
}

func runProcess(_ executable: String, _ args: [String] = [], stdinText: String? = nil, completion: ((Int32, String) -> Void)? = nil) {
    let process = Process()
    let output = Pipe()
    process.executableURL = URL(fileURLWithPath: executable)
    process.arguments = args
    process.standardOutput = output
    process.standardError = output
    var inputPipe: Pipe?
    if stdinText != nil {
        let pipe = Pipe()
        process.standardInput = pipe
        inputPipe = pipe
    }
    process.terminationHandler = { proc in
        let data = output.fileHandleForReading.readDataToEndOfFile()
        let text = String(data: data, encoding: .utf8) ?? ""
        completion?(proc.terminationStatus, text)
    }
    do {
        try process.run()
        if let stdinText = stdinText, let inputPipe = inputPipe {
            inputPipe.fileHandleForWriting.write(Data(stdinText.utf8))
            inputPipe.fileHandleForWriting.closeFile()
        }
    } catch {
        completion?(-1, String(describing: error))
    }
}

func showNotification(_ title: String, _ body: String) {
    // AppleScript string literals require double quotes and cannot contain raw
    // newlines, so inlining arbitrary command output into the script text throws
    // a -2741 syntax error. Keep the script a fixed literal and pass body/title
    // as osascript argv instead — no escaping, no syntax error, any text is safe.
    let script = "on run argv\\ndisplay notification (item 1 of argv) with title (item 2 of argv)\\nend run"
    runProcess("/usr/bin/osascript", ["-e", script, clipped(body), title]) { code, output in
        if code != 0 {
            showAlert(title, informative: output)
        }
    }
}

func redactSecrets(_ value: String, secrets: [String] = []) -> String {
    var text = value
    for secret in secrets where secret.count >= 4 {
        text = text.replacingOccurrences(of: secret, with: "[redacted]")
    }
    let patterns = [
        #"sk-proj-[A-Za-z0-9_-]{12,}"#,
        #"sk-or-v1-[A-Za-z0-9_-]{12,}"#,
        #"sk-or-[A-Za-z0-9_-]{12,}"#,
        #"sk-clb-[A-Za-z0-9_-]{8,}"#,
        #"sk-[A-Za-z0-9_-]{20,}"#,
        #"(?i)(api[_-]?key|secret|token)\\s*[:=]\\s*[^\\s"',}]+"#
    ]
    for pattern in patterns {
        if let regex = try? NSRegularExpression(pattern: pattern) {
            let range = NSRange(text.startIndex..<text.endIndex, in: text)
            text = regex.stringByReplacingMatches(in: text, range: range, withTemplate: "[redacted]")
        }
    }
    return text
}

func writeActionLog(_ text: String) {
    let url = URL(fileURLWithPath: lastActionLogPath)
    try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    if !FileManager.default.fileExists(atPath: lastActionLogPath) {
        FileManager.default.createFile(atPath: lastActionLogPath, contents: Data(), attributes: [.posixPermissions: 0o600])
    }
    try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: lastActionLogPath)
    if let handle = try? FileHandle(forWritingTo: url) {
        try? handle.truncate(atOffset: 0)
        handle.write(Data(text.utf8))
        try? handle.close()
    }
}

struct MenuState {
    let title: String
    let line: String
}

struct MenuBarConfig {
    let quitWithCodex: Bool
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    var statusItem: NSStatusItem!
    var statusLineItem: NSMenuItem!
    var codexLbItem: NSMenuItem!
    var oauthItem: NSMenuItem!
    var timer: Timer?
    var busy = false
    var lastFailure = false
    var quitWithCodex = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        quitWithCodex = readConfig().quitWithCodex
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.autosaveName = "com.sneakoscope.sks-menubar"
        if let button = statusItem.button {
            configureStatusButton(button, title: "SKS")
        }

        let menu = NSMenu()
        menu.delegate = self
        statusLineItem = NSMenuItem(title: "SKS v\\(packageVersion) - starting", action: nil, keyEquivalent: "")
        statusLineItem.isEnabled = false
        menu.addItem(statusLineItem)
        menu.addItem(NSMenuItem.separator())
        codexLbItem = add(menu, "Use codex-lb", #selector(useCodexLb))
        oauthItem = add(menu, "Use ChatGPT OAuth", #selector(useChatGptOAuth))
        add(menu, "Set codex-lb Domain and Key", #selector(setCodexLbDomainAndKey))
        menu.addItem(NSMenuItem.separator())
        add(menu, "Set OpenRouter Key and GLM Profiles", #selector(setOpenRouterKey))
        add(menu, "Fast Check", #selector(fastCheck))
        add(menu, "SKS Version Check", #selector(sksVersionCheck))
        add(menu, "Update SKS Now", #selector(updateSksNow))
        menu.addItem(NSMenuItem.separator())
        add(menu, "Open Dashboard", #selector(openDashboard))
        add(menu, "Open Codex Settings", #selector(openCodexSettings))
        add(menu, "Restart Codex", #selector(restartCodex))
        menu.addItem(NSMenuItem.separator())
        add(menu, "View Last Log", #selector(viewLastLog))
        add(menu, "Quit SKS Menu", #selector(quit))
        statusItem.menu = menu
        configureCodexLifecycleSync()
        updateState()
        timer = Timer.scheduledTimer(withTimeInterval: 30.0, repeats: true) { [weak self] _ in self?.updateState() }
    }

    func menuWillOpen(_ menu: NSMenu) {
        updateState()
        updateAuthModeChecks()
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

    func add(_ menu: NSMenu, _ title: String, _ selector: Selector) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: selector, keyEquivalent: "")
        item.target = self
        menu.addItem(item)
        return item
    }

${codexLifecycleSource}

    func readConfig() -> MenuBarConfig {
        guard let data = FileManager.default.contents(atPath: menubarConfigPath),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return MenuBarConfig(quitWithCodex: false)
        }
        return MenuBarConfig(quitWithCodex: json["quit_with_codex"] as? Bool == true)
    }

    func updateState() {
        let state = readMenuState()
        if let button = statusItem.button {
            configureStatusButton(button, title: state.title)
        }
        statusLineItem.title = state.line
    }

    func readMenuState() -> MenuState {
        if codexBundleId == nil {
            return MenuState(title: "SKS", line: "Codex app not detected — sync disabled")
        }
        if busy {
            return MenuState(title: "SKS ⋯", line: "SKS v\\(packageVersion) - working")
        }
        if !actionScriptUsable() {
            return MenuState(title: "SKS ⚠", line: "SKS v\\(packageVersion) - action script broken (run sks doctor --fix)")
        }
        if lastFailure {
            return MenuState(title: "SKS ⚠", line: "SKS v\\(packageVersion) - last action failed")
        }
        if updateAvailable() {
            return MenuState(title: "SKS ↑", line: "SKS v\\(packageVersion) - update available")
        }
        return MenuState(title: "SKS", line: "SKS v\\(packageVersion) - OK")
    }

    func actionScriptUsable() -> Bool {
        return FileManager.default.isExecutableFile(atPath: actionScript)
    }

    func updateAvailable() -> Bool {
        let cachePath = NSString(string: "~/.sneakoscope/cache/update-notice.json").expandingTildeInPath
        guard let data = FileManager.default.contents(atPath: cachePath) else { return false }
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return false }
        if let available = json["update_available"] as? Bool { return available }
        guard let latest = json["latest_version"] as? String else { return false }
        return latest != packageVersion && !latest.isEmpty
    }

    func runSksCapture(_ args: [String], title: String, stdinText: String? = nil, notify: Bool = true, completion: ((Int32, String) -> Void)? = nil) {
        busy = true
        lastFailure = false
        updateState()
        runProcess(actionScript, args, stdinText: stdinText) { [weak self] code, output in
            let redacted = redactSecrets(output, secrets: stdinText == nil ? [] : [stdinText ?? ""])
            writeActionLog("$ sks \\(args.joined(separator: " "))\\n\\(redacted)\\n")
            DispatchQueue.main.async {
                self?.busy = false
                self?.lastFailure = code != 0
                self?.updateState()
                if notify {
                    if code == 0 {
                        showNotification(title, "OK\\n" + redacted)
                    } else {
                        showAlert(title + " failed", informative: humanizeSksFailure(redacted))
                    }
                }
                completion?(code, redacted)
            }
        }
    }

    func runSksBackground(_ args: [String], title: String, stdinText: String? = nil, completion: ((Int32, String) -> Void)? = nil) {
        runSksCapture(args, title: title, stdinText: stdinText, notify: true, completion: completion)
    }

    func startSksDetached(_ args: [String], title: String) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: actionScript)
        process.arguments = args
        writeActionLog("$ sks \\(args.joined(separator: " "))\\nstarted\\n")
        if let handle = try? FileHandle(forWritingTo: URL(fileURLWithPath: lastActionLogPath)) {
            process.standardOutput = handle
            process.standardError = handle
        }
        do {
            try process.run()
            showNotification(title, "started")
        } catch {
            showAlert(title + " failed", informative: String(describing: error))
        }
    }

    func updateAuthModeChecks() {
        runSksCapture(["codex-lb", "status", "--json"], title: "SKS Auth Status", notify: false) { [weak self] code, output in
            guard let self = self else { return }
            let lower = output.lowercased()
            let codexLbActive = code == 0 && (lower.contains(#""configured": true"#) || lower.contains(#""model_provider": "codex-lb""#) || lower.contains(#""mode": "codex-lb""#))
            self.codexLbItem.state = codexLbActive ? .on : .off
            self.oauthItem.state = codexLbActive ? .off : .on
        }
    }

    @objc func useCodexLb() {
        runSksBackground(["codex-lb", "use-codex-lb", "--json"], title: "Use codex-lb") { [weak self] code, _ in
            if code == 0 { self?.updateAuthModeChecks() }
        }
    }

    @objc func useChatGptOAuth() {
        runSksBackground(["codex-lb", "use-oauth", "--json"], title: "Use ChatGPT OAuth") { [weak self] code, _ in
            if code == 0 { self?.updateAuthModeChecks() }
        }
    }

    @objc func setCodexLbDomainAndKey() {
        guard let domain = promptText(title: "Set codex-lb Domain", message: "Enter just your codex-lb domain or base URL — the /backend-api/codex path is added automatically.", placeholder: "lb.example.com") else { return }
        guard let key = promptText(title: "Set codex-lb Key", message: "Enter your codex-lb API key.", placeholder: "sk-clb-...", secure: true) else { return }
        runSksBackground(["codex-lb", "setup", "--host", domain, "--api-key-stdin", "--yes", "--json"], title: "Set codex-lb", stdinText: key + "\\n") { [weak self] code, _ in
            if code == 0 { self?.updateAuthModeChecks() }
        }
    }

    @objc func setOpenRouterKey() {
        guard let key = promptText(title: "Set OpenRouter Key", message: "Enter your OpenRouter API key.", placeholder: "sk-or-v1-...", secure: true) else { return }
        runSksBackground(["codex-app", "set-openrouter-key", "--api-key-stdin", "--json"], title: "Set OpenRouter Key", stdinText: key + "\\n")
    }

    @objc func fastCheck() {
        runSksBackground(["codex-lb", "fast-check"], title: "SKS Fast Check")
    }

    @objc func sksVersionCheck() {
        runSksBackground(["update", "check"], title: "SKS Version Check")
    }

    @objc func updateSksNow() {
        runSksBackground(["update"], title: "Update SKS Now")
    }

    @objc func openDashboard() {
        let urlString = "http://127.0.0.1:4477"
        runProcess("/usr/bin/curl", ["-fsS", "--max-time", "1", urlString]) { [weak self] code, _ in
            DispatchQueue.main.async {
                if code != 0 {
                    self?.startSksDetached(["ui"], title: "SKS Dashboard")
                }
                if let url = URL(string: urlString) {
                    NSWorkspace.shared.open(url)
                }
            }
        }
    }

    @objc func openCodexSettings() {
        runProcess("/usr/bin/open", ["codex://settings"])
    }

    @objc func restartCodex() {
        let running = NSWorkspace.shared.runningApplications.filter { app in
            if let bundle = codexBundleId, app.bundleIdentifier == bundle { return true }
            return app.localizedName == "Codex"
        }
        for app in running {
            app.terminate()
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            if let bundle = codexBundleId, let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundle) {
                NSWorkspace.shared.open(url)
                showNotification("Restart Codex", "requested")
            } else {
                showAlert("Restart Codex failed", informative: "Codex app bundle could not be resolved.")
            }
        }
    }

    @objc func viewLastLog() {
        if FileManager.default.fileExists(atPath: lastActionLogPath) {
            NSWorkspace.shared.open(URL(fileURLWithPath: lastActionLogPath))
        } else {
            showAlert("No SKS menu log yet", informative: lastActionLogPath)
        }
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
  quiet?: boolean;
}) {
  await fs.rm(input.paths.staging_app_path, { recursive: true, force: true });
  await ensureDir(path.join(input.paths.staging_app_path, 'Contents', 'MacOS'));
  await writeTextAtomic(input.paths.source_path, input.swiftSource);
  input.actions.push(`wrote ${input.paths.source_path}`);
  await writeTextAtomic(path.join(input.paths.staging_app_path, 'Contents', 'Info.plist'), input.infoPlist);
  const stagingExecutable = path.join(input.paths.staging_app_path, 'Contents', 'MacOS', 'SKSMenuBar');
  const compileWork = runProcess(input.swiftc, ['-framework', 'Cocoa', input.paths.source_path, '-o', stagingExecutable], {
    timeoutMs: 60_000,
    maxOutputBytes: 64 * 1024
  }).catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }));
  const compile = input.quiet === true ? await compileWork : await withHeartbeat('swiftc SKS menu bar', compileWork, { warnAfterMs: 30_000 });
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
  quiet?: boolean;
}): Promise<NonNullable<SksMenuBarInstallResult['launch']>> {
  const service = launchServiceName();
  const domain = launchDomain();
  const stdio = {
    stdoutFile: path.join(input.paths.install_dir, 'launchctl.out.log'),
    stderrFile: path.join(input.paths.install_dir, 'launchctl.err.log')
  };
  const alreadyWork = waitForLaunchctlRunning(input.launchctl, service);
  const already = input.quiet === true ? await alreadyWork : await withHeartbeat('launchctl SKS menu bar wait', alreadyWork, { warnAfterMs: 10_000 });
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
      // A kickstart timeout does not mean the relaunch failed — under heavy
      // system load (e.g. mid `npm install -g`) the app can take well past the
      // kickstart timeout to reach running state, so give the recheck a much
      // longer window before declaring the whole install blocked.
      const printedWork = waitForLaunchctlRunning(input.launchctl, service, 20);
      const printed = input.quiet === true ? await printedWork : await withHeartbeat('launchctl SKS menu bar wait', printedWork, { warnAfterMs: 10_000 });
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

async function waitForLaunchctlRunning(launchctl: string, service: string, attempts = 6): Promise<{ code: number | null; running: boolean }> {
  let lastCode: number | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
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
  const running = result.code === 0 && (state === 'running' || Boolean(pidText));
  return {
    checked: true,
    ok: running,
    service,
    state,
    pid: pidText ? Number(pidText) : null,
    error: running ? null : String(result.stderr || result.stdout || state || 'launchd_not_running').trim()
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
    if (!result.warnings.includes('menubar_report_write_failed')) result.warnings.push('menubar_report_write_failed');
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
