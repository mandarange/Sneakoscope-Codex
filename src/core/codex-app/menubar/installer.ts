import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureDir, exists, PACKAGE_VERSION, readJson, readText, runProcess, sha256, which,
  writeJsonAtomic, writeTextAtomic
} from '../../fsx.js';
import { actionScriptSource } from './action-runner.js';
import { buildMenuBarAppAtomically, MenuBarBuildError } from './app-bundle.js';
import { aggregateFileHashes, createSksMenuBarBuildStamp, menuBarBuildStampsEqual } from './build-stamp.js';
import { MENU_ITEMS, SKS_MENUBAR_LABEL } from './constants.js';
import { resolveCodexBundleId, writeDefaultMenuBarConfig } from './config.js';
import { launchAgentSource, launchMenuBar, seedMenuBarPreferredPosition } from './launch-agent.js';
import { cleanupMacLaunchSecretEnvironment } from './migration.js';
import { sksMenuBarPaths } from './paths.js';
import { infoPlistSource, inspectInstalledResources, loadNativeMenuBarSources, nativeResourceHashes } from './resources.js';
import { inspectSignature } from './signature.js';
import { defaultNextActions, inspectSksMenuBarStatus, isMenuBarInstallPathUnderTempDir } from './status.js';
import type { NativeSourceInput, SecretLaunchEnvCleanupResult, SksMenuBarBuildStamp, SksMenuBarInstallOptions, SksMenuBarInstallResult, SksMenuBarTargetCheck } from './types.js';

export async function installSksMenuBar(opts: SksMenuBarInstallOptions = {}): Promise<SksMenuBarInstallResult> {
  const apply = opts.apply === true;
  const env = opts.env || process.env;
  const paths = sksMenuBarPaths(opts.home || env.HOME, opts.root);
  const actions: string[] = [];
  const warnings: string[] = [];
  let targetCheck: SksMenuBarTargetCheck | undefined;
  let codexBundleId: string | null = null;
  let cleanup: SecretLaunchEnvCleanupResult | undefined;

  if (process.platform !== 'darwin') {
    const result = baseResult(paths, apply, 'unsupported_platform', true, actions, ['sks_menubar_requires_macos']);
    result.app_path = null;
    result.executable_path = null;
    result.launch_agent_path = null;
    result.action_script_path = null;
    result.build_stamp_path = null;
    result.config_path = null;
    result.report_path = apply ? paths.report_path : null;
    result.launch = { requested: false, method: 'none', ok: true };
    if (apply) await writeReport(paths.report_path, result);
    return result;
  }

  if (!apply) {
    const status = await inspectSksMenuBarStatus({ home: paths.home, root: paths.root, env }).catch(() => null);
    const result = baseResult(paths, false, 'planned', status?.ok !== false, status?.installed ? ['menubar_app_present'] : ['menubar_app_install_available'], status?.warnings || []);
    result.codex_bundle_id = status?.codex_sync.bundle_id || null;
    result.build_stamp = status?.build_stamp || null;
    result.blockers = status?.blockers || [];
    result.launch = { requested: false, method: 'skipped', ok: true };
    return result;
  }

  await ensureDir(paths.install_dir);
  await ensureDir(paths.logs_dir);
  await ensureDir(paths.operations_dir);
  await ensureDir(path.dirname(paths.launch_agent_path));
  cleanup = await cleanupMacLaunchSecretEnvironment({ env });
  if (!cleanup.ok) warnings.push('launch_secret_env_cleanup_incomplete');

  const swiftc = env.SKS_MENUBAR_SWIFTC || await which('swiftc').catch(() => null) || '/usr/bin/swiftc';
  const codesign = env.SKS_MENUBAR_CODESIGN || await which('codesign').catch(() => null) || '/usr/bin/codesign';
  const launchctl = env.SKS_MENUBAR_LAUNCHCTL || await which('launchctl').catch(() => null) || '/bin/launchctl';
  const open = env.SKS_MENUBAR_OPEN || await which('open').catch(() => null) || '/usr/bin/open';
  const xcodeSelect = env.SKS_MENUBAR_XCODE_SELECT || await which('xcode-select').catch(() => null) || '/usr/bin/xcode-select';
  const clt = await runProcess(xcodeSelect, ['-p'], { timeoutMs: 5_000, maxOutputBytes: 8 * 1024 }).catch(() => ({ code: 1, stdout: '', stderr: '' }));
  if (clt.code !== 0) return blocked('xcode_clt_missing', 'Run xcode-select --install');
  if (!(await exists(swiftc))) return blocked('swiftc_missing');
  if (!(await exists(codesign))) return blocked('codesign_missing');

  codexBundleId = await resolveCodexBundleId({ home: paths.home, env, warnings });
  const config = await writeDefaultMenuBarConfig(paths.config_path, codexBundleId);
  targetCheck = await resolveSksEntryForInstall(opts.sksEntry, paths.root);
  if (!targetCheck.exists || !targetCheck.resolved) return blocked('sks_entry_unresolved');
  if (targetCheck.project_local) warnings.push('sks_entry_project_local');
  const previousActionScript = await readText(paths.action_script_path, '');
  const previous = await readJson<SksMenuBarBuildStamp | null>(paths.build_stamp_path, null);
  const actionScript = actionScriptSource({ nodeBin: process.execPath, sksEntry: targetCheck.resolved });
  await writeTextAtomic(paths.action_script_path, actionScript);
  await fs.chmod(paths.action_script_path, 0o755);
  const runtime: NativeSourceInput = {
    actionScriptPath: paths.action_script_path,
    buildStampPath: paths.build_stamp_path,
    configPath: paths.config_path,
    lastActionLogPath: paths.last_action_log_path,
    operationDirPath: paths.operations_dir,
    codexBundleId: config.codex_bundle_id,
    packageVersion: PACKAGE_VERSION
  };
  const sourceFiles = loadNativeMenuBarSources(runtime);
  const sourceHashes = Object.fromEntries(sourceFiles.map((entry) => [entry.name, entry.sha256]));
  let resourceHashes: Record<string, string>;
  try {
    resourceHashes = nativeResourceHashes();
  } catch (error) {
    return blocked('menubar_resource_missing', error instanceof Error ? error.message : String(error));
  }
  const infoPlist = infoPlistSource(PACKAGE_VERSION);
  const launchAgent = launchAgentSource(paths.executable_path, paths.install_dir);
  const swiftcVersion = await toolVersion(swiftc, ['--version']);
  const stamp = createSksMenuBarBuildStamp({
    packageVersion: PACKAGE_VERSION,
    sourceHashes,
    resourceHashes,
    actionScriptSha256: sha256(actionScript),
    infoPlistSha256: sha256(infoPlist),
    launchAgentSha256: sha256(launchAgent),
    swiftcVersion,
    codesignIdentifier: SKS_MENUBAR_LABEL
  });
  const currentAction = await readText(paths.action_script_path, '');
  const bundleExists = await exists(paths.executable_path);
  const resources = bundleExists
    ? await inspectInstalledResources({ resourcesDir: paths.resources_path, buildStamp: previous })
    : { checked: false, ok: false, missing: [], mismatched: [] };
  const signature = bundleExists
    ? await inspectSignature(paths.app_path, { ...env, SKS_MENUBAR_CODESIGN: codesign })
    : { checked: false, identifier: null, ok: false, error: 'app_missing' };
  const installedInfoPlist = await readText(paths.info_plist_path, '');
  const upToDate = bundleExists
    && currentAction === actionScript
    && menuBarBuildStampsEqual(previous, stamp)
    && resources.ok
    && signature.ok
    && sha256(installedInfoPlist) === stamp.info_plist_sha256;
  if (upToDate) {
    actions.push('menubar_up_to_date');
  } else {
    const preservingPrevious = await exists(paths.app_path);
    try {
      if (preservingPrevious) {
        if (previous) await writeJsonAtomic(paths.previous_build_stamp_path, previous);
        if (previousActionScript) {
          await writeTextAtomic(paths.previous_action_script_path, previousActionScript);
          await fs.chmod(paths.previous_action_script_path, 0o755);
        }
      }
      const built = await buildMenuBarAppAtomically({
        paths, swiftc, codesign, runtime, infoPlist, actions,
        ...(opts.quiet === undefined ? {} : { quiet: opts.quiet })
      });
      stamp.source_sha256 = built.sourceSha256;
      stamp.source_files_sha256 = built.sourceHashes;
      stamp.resources_sha256 = aggregateFileHashes(built.resourceHashes);
      stamp.resource_files_sha256 = built.resourceHashes;
    } catch (error) {
      if (error instanceof MenuBarBuildError) return blocked(error.blocker, error.message);
      return blocked('menubar_build_failed', error instanceof Error ? error.message : String(error));
    }
  }
  await writeTextAtomic(paths.launch_agent_path, launchAgent);
  await writeJsonAtomic(paths.build_stamp_path, stamp);
  const launchWanted = opts.launch !== false && env.SKS_SKIP_SKS_MENUBAR_LAUNCH !== '1';
  const launchAllowed = path.resolve(paths.home) === realUserHome() && !isMenuBarInstallPathUnderTempDir(paths.executable_path, env);
  if (launchWanted && path.resolve(paths.home) !== realUserHome()) warnings.push('launch_skipped_non_user_home');
  if (launchWanted && isMenuBarInstallPathUnderTempDir(paths.executable_path, env)) warnings.push('launch_skipped_temp_install');
  let launch: NonNullable<SksMenuBarInstallResult['launch']> = { requested: false, method: 'skipped', ok: true };
  if (launchWanted && launchAllowed) {
    if (await seedMenuBarPreferredPosition(env)) actions.push('seeded SKS menu bar preferred position');
    launch = await launchMenuBar({ launchctl, open, paths });
  }
  const ok = launch.ok;
  const result = baseResult(paths, true, ok ? (launch.requested ? (launch.method === 'open-fallback' ? 'installed_open_fallback' : 'installed') : 'installed_launch_skipped') : 'blocked', ok, actions, warnings);
  result.codex_bundle_id = codexBundleId;
  result.target_check = targetCheck;
  result.build_stamp = stamp;
  result.secret_env_cleanup = cleanup;
  result.launch = launch;
  result.blockers = ok ? [] : [launch.error || 'sks_menubar_launch_failed'];
  await writeReport(paths.report_path, result);
  return result;

  async function blocked(reason: string, detail?: string): Promise<SksMenuBarInstallResult> {
    const result = baseResult(paths, apply, 'blocked', false, actions, detail ? [...warnings, detail] : warnings);
    result.codex_bundle_id = codexBundleId;
    if (targetCheck) result.target_check = targetCheck;
    if (cleanup) result.secret_env_cleanup = cleanup;
    result.blockers = [reason];
    result.launch = { requested: false, method: 'none', ok: false, error: detail || reason };
    await writeReport(paths.report_path, result);
    return result;
  }
}

function baseResult(paths: ReturnType<typeof sksMenuBarPaths>, apply: boolean, status: SksMenuBarInstallResult['status'], ok: boolean, actions: string[], warnings: string[]): SksMenuBarInstallResult {
  return {
    schema: 'sks.codex-app-sks-menubar.v1', ok, apply, status, platform: process.platform,
    app_path: paths.app_path, executable_path: paths.executable_path,
    launch_agent_path: paths.launch_agent_path, action_script_path: paths.action_script_path,
    build_stamp_path: paths.build_stamp_path, config_path: paths.config_path,
    report_path: paths.report_path, menu_items: [...MENU_ITEMS], actions,
    tcc_automation_status: 'unknown', next_actions: defaultNextActions(), blockers: [], warnings
  };
}

async function resolveSksEntryForInstall(explicit: string | undefined, root: string): Promise<SksMenuBarTargetCheck> {
  const packaged = fileURLToPath(new URL('../../../bin/sks.js', import.meta.url));
  const requested = explicit ? path.resolve(explicit) : null;
  const candidate = requested || packaged;
  const found = await exists(candidate);
  const relative = path.relative(path.resolve(root), candidate);
  return {
    requested, resolved: found ? candidate : null, packaged, exists: found,
    project_local: relative === '' || (Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative)),
    used_previous_script: false
  };
}

async function toolVersion(tool: string, args: string[]): Promise<string> {
  const result = await runProcess(tool, args, { timeoutMs: 5_000, maxOutputBytes: 16 * 1024 }).catch(() => ({ code: 1, stdout: '', stderr: '' }));
  return result.code === 0 ? String(result.stdout || result.stderr).trim().split(/\r?\n/)[0] || 'unknown' : 'unknown';
}

function realUserHome(): string {
  try { return path.resolve(os.userInfo().homedir); } catch { return path.resolve(os.homedir()); }
}

async function writeReport(reportPath: string, result: SksMenuBarInstallResult): Promise<void> {
  try { await writeJsonAtomic(reportPath, result); }
  catch { result.report_write_failed = true; result.warnings.push('menubar_report_write_failed'); }
}
