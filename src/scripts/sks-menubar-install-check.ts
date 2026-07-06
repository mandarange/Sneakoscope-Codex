import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PACKAGE_VERSION, runProcess, which } from '../core/fsx.js';
import { installSksMenuBar } from '../core/codex-app/sks-menubar.js';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-menubar-check-'));
const envHomeTemp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-menubar-env-home-check-'));
const fakeRoot = path.join(temp, 'project-root');
await fs.mkdir(fakeRoot, { recursive: true });
const launchGuardEnv = { ...process.env, SKS_SKIP_SKS_MENUBAR_LAUNCH: '0' };
const localEntry = path.join(fakeRoot, 'dist', 'bin', 'sks.js');
await fs.mkdir(path.dirname(localEntry), { recursive: true });
await fs.writeFile(localEntry, '#!/usr/bin/env node\n', 'utf8');

const result = await installSksMenuBar({
  apply: true,
  launch: true,
  home: temp,
  root: fakeRoot,
  sksEntry: localEntry,
  env: launchGuardEnv
});
const secondResult = await installSksMenuBar({
  apply: true,
  launch: true,
  home: temp,
  root: fakeRoot,
  sksEntry: localEntry,
  env: launchGuardEnv
});
if (secondResult.action_script_path) await fs.rm(secondResult.action_script_path, { force: true });
const restoredScriptResult = await installSksMenuBar({
  apply: true,
  launch: true,
  home: temp,
  root: fakeRoot,
  sksEntry: localEntry,
  env: launchGuardEnv
});
if (restoredScriptResult.action_script_path) {
  await fs.writeFile(restoredScriptResult.action_script_path, '#!/bin/zsh\necho stale-sks-menubar-action\n', 'utf8');
}
const staleScriptMissingEntryResult = await installSksMenuBar({
  apply: true,
  launch: true,
  home: temp,
  root: fakeRoot,
  sksEntry: path.join(fakeRoot, 'dist', 'bin', 'missing-sks.js'),
  env: launchGuardEnv
});
const recoveredStaleScriptResult = await installSksMenuBar({
  apply: true,
  launch: true,
  home: temp,
  root: fakeRoot,
  sksEntry: localEntry,
  env: launchGuardEnv
});
if (recoveredStaleScriptResult.action_script_path) {
  await fs.chmod(recoveredStaleScriptResult.action_script_path, 0o644);
}
const restoredExecutableBitResult = await installSksMenuBar({
  apply: true,
  launch: true,
  home: temp,
  root: fakeRoot,
  sksEntry: localEntry,
  env: launchGuardEnv
});
const envHomeResult = await installSksMenuBar({
  apply: true,
  launch: true,
  root: envHomeTemp,
  sksEntry: path.join(process.cwd(), 'dist', 'bin', 'sks.js'),
  env: { ...launchGuardEnv, HOME: envHomeTemp }
});

const executableExists = result.executable_path ? await exists(result.executable_path) : false;
const launchAgentExists = result.launch_agent_path ? await exists(result.launch_agent_path) : false;
const actionScriptExists = result.action_script_path ? await exists(result.action_script_path) : false;
const buildStampExists = result.build_stamp_path ? await exists(result.build_stamp_path) : false;
const generatedSourcePath = result.app_path ? path.join(path.dirname(result.app_path), 'SKSMenuBar.swift') : null;
const generatedSource = generatedSourcePath ? await fs.readFile(generatedSourcePath, 'utf8').catch(() => '') : '';
const actionScript = result.action_script_path ? await fs.readFile(result.action_script_path, 'utf8').catch(() => '') : '';
const launchAgentSource = result.launch_agent_path ? await fs.readFile(result.launch_agent_path, 'utf8').catch(() => '') : '';
const infoPlistPath = result.app_path ? path.join(result.app_path, 'Contents', 'Info.plist') : null;
const infoPlist = infoPlistPath ? await fs.readFile(infoPlistPath, 'utf8').catch(() => '') : '';
const swiftParse = await swiftParseSmoke(generatedSourcePath);
const commandRegistry = await fs.readFile(path.join(process.cwd(), 'src', 'cli', 'command-registry.ts'), 'utf8');
const installHelpers = await fs.readFile(path.join(process.cwd(), 'src', 'cli', 'install-helpers.ts'), 'utf8');
const cltMissing = process.platform === 'darwin' && result.blockers.includes('xcode_clt_missing');

const hasVisibleStatusSource = generatedSource.includes('NSStatusItem.variableLength')
  && generatedSource.includes('configureStatusButton(button, title: state.title)')
  && generatedSource.includes('SKS ⚠')
  && generatedSource.includes('SKS ↑')
  && generatedSource.includes('SKS ⋯')
  && generatedSource.includes('Timer.scheduledTimer(withTimeInterval: 30.0');
const hasBackgroundReadonlyActions = generatedSource.includes('runSksBackground(["codex-lb", "fast-check"]')
  && generatedSource.includes('runSksBackground(["fast-mode", "on", "--json"]')
  && generatedSource.includes('runSksBackground(["fast-mode", "off", "--json"]')
  && generatedSource.includes('runSksSilent(["fast-mode", "status", "--json"]')
  && generatedSource.includes('runSksBackground(["update", "check"]')
  && generatedSource.includes('display notification')
  && !generatedSource.includes('runSksInTerminal')
  && !generatedSource.includes('runInTerminal');
const hasNativeModalSource = generatedSource.includes('func promptText(title: String, message: String')
  && generatedSource.includes('NSSecureTextField')
  && generatedSource.includes('stdinText: key + "\\n"');
const hasActionLogSource = generatedSource.includes('lastActionLogPath')
  && generatedSource.includes('.posixPermissions: 0o600')
  && generatedSource.includes('redactSecrets');
const hasAutosaveNameSource = generatedSource.includes('statusItem.autosaveName = "com.sneakoscope.sks-menubar"');
const hasCodexLifecycleSource = generatedSource.includes('Codex app not detected — sync disabled')
  || (generatedSource.includes('NSWorkspace.didLaunchApplicationNotification') && generatedSource.includes('NSWorkspace.didTerminateApplicationNotification'));
const hasNoUnconditionalKeepAlive = !launchAgentSource.includes('<key>KeepAlive</key>');
const hasNoLaunchAgentSecrets = !launchAgentSource.includes('EnvironmentVariables')
  && !launchAgentSource.includes('CODEX_LB_API_KEY')
  && !launchAgentSource.includes('OPENROUTER_API_KEY');
const hasInteractiveProcessType = launchAgentSource.includes('<key>ProcessType</key>')
  && launchAgentSource.includes('<string>Interactive</string>');
const hasPackagePlistVersion = infoPlist.includes(`<string>${PACKAGE_VERSION}</string>`)
  && infoPlist.includes('<key>CFBundleShortVersionString</key>')
  && infoPlist.includes('<key>CFBundleVersion</key>');
const hasActionFallbacks = actionScript.includes('command -v sks')
  && actionScript.includes('npm root -g')
  && actionScript.includes('.nvm/versions/node/*/lib/node_modules/sneakoscope/dist/bin/sks.js')
  && actionScript.includes('/bin/zsh -lc')
  && actionScript.includes('exit 127')
  && actionScript.includes('display notification');
const hasEntryWarning = result.warnings.includes('sks_entry_project_local');
const hasBuildStamp = buildStampExists
  && result.build_stamp?.package_version === PACKAGE_VERSION
  && result.build_stamp?.codesign_identifier === 'com.sneakoscope.sks-menubar';
const isIdempotent = secondResult.actions.includes('menubar_up_to_date')
  && secondResult.build_stamp?.action_script_sha256 === result.build_stamp?.action_script_sha256;
const restoresMissingActionScript = restoredScriptResult.actions.includes(`wrote ${secondResult.action_script_path}`)
  && actionScriptExists
  && restoredScriptResult.build_stamp?.action_script_sha256 === result.build_stamp?.action_script_sha256;
const blocksStaleActionScriptReuse = staleScriptMissingEntryResult.ok === false
  && staleScriptMissingEntryResult.blockers.includes('sks_entry_unresolved')
  && staleScriptMissingEntryResult.warnings.includes('sks_entry_unresolved_stale_action_script_not_reused')
  && staleScriptMissingEntryResult.target_check?.used_previous_script === false;
const recoversStaleActionScriptWhenEntryExists = recoveredStaleScriptResult.ok === true
  && recoveredStaleScriptResult.actions.includes(`wrote ${restoredScriptResult.action_script_path}`)
  && recoveredStaleScriptResult.build_stamp?.action_script_sha256 === result.build_stamp?.action_script_sha256;
const restoresExecutableBit = restoredExecutableBitResult.ok === true
  && restoredExecutableBitResult.actions.includes('menubar_up_to_date')
  && restoredExecutableBitResult.actions.includes('restored action script executable bit')
  && actionScriptExists
  && await isExecutable(result.action_script_path);
const hasCommandRegistry = commandRegistry.includes('menubar:')
  && commandRegistry.includes('menubarCommand')
  && commandRegistry.includes('dist/core/commands/menubar-command.js');
const noLaunchctlSecretSetenv = !installHelpers.includes('{ CODEX_LB_API_KEY: apiKey')
  && !installHelpers.includes("['setenv', 'CODEX_LB_API_KEY")
  && !installHelpers.includes("['setenv', 'OPENROUTER_API_KEY");
const hasLaunchctlUnsetenv = installHelpers.includes('cleanupMacLaunchSecretEnvironment')
  && installHelpers.includes('skipped_secret_variables');
const expectedMenuItems = [
  'Use codex-lb',
  'Use ChatGPT OAuth',
  'Set codex-lb Domain and Key',
  'Set OpenRouter Key and GLM Profiles',
  'Fast Mode On',
  'Fast Mode Off',
  'Fast Check',
  'SKS Version Check',
  'Update SKS Now',
  'View Last Log'
];
const missingExpectedItems = expectedMenuItems.filter((item) => !result.menu_items.includes(item));
const hasExpectedItems = missingExpectedItems.length === 0;
const launchSkippedForTempHome = result.launch?.requested === false
  && result.launch?.method === 'skipped'
  && result.warnings.includes('launch_skipped_non_user_home');
const launchSkippedForEnvHome = envHomeResult.launch?.requested === false
  && envHomeResult.launch?.method === 'skipped'
  && envHomeResult.warnings.includes('launch_skipped_non_user_home');
const launchSkippedForTempInstall = result.launch?.requested === false
  && result.warnings.includes('launch_skipped_temp_install')
  && envHomeResult.launch?.requested === false
  && envHomeResult.warnings.includes('launch_skipped_temp_install');
const preferredPositionSkippedForTempInstall = !result.actions.includes('seeded SKS menu bar preferred position')
  && !envHomeResult.actions.includes('seeded SKS menu bar preferred position');
const darwinOk = cltMissing
  ? swiftParse.status === 'skipped' && swiftParse.reason === 'xcode_clt_missing'
  : result.ok === true
    && result.status === 'installed_launch_skipped'
    && secondResult.ok === true
    && envHomeResult.ok === true
    && envHomeResult.status === 'installed_launch_skipped'
    && executableExists
    && launchAgentExists
    && actionScriptExists
    && hasExpectedItems
    && hasVisibleStatusSource
    && hasBackgroundReadonlyActions
    && hasNativeModalSource
    && hasActionLogSource
    && hasAutosaveNameSource
    && hasCodexLifecycleSource
    && hasNoUnconditionalKeepAlive
    && hasNoLaunchAgentSecrets
    && hasInteractiveProcessType
    && hasPackagePlistVersion
    && hasActionFallbacks
    && hasEntryWarning
    && hasBuildStamp
    && swiftParse.ok === true
    && isIdempotent
    && restoresMissingActionScript
    && blocksStaleActionScriptReuse
    && recoversStaleActionScriptWhenEntryExists
    && restoresExecutableBit
    && hasCommandRegistry
    && noLaunchctlSecretSetenv
    && hasLaunchctlUnsetenv
    && launchSkippedForTempHome
    && launchSkippedForEnvHome
    && launchSkippedForTempInstall
    && preferredPositionSkippedForTempInstall;
const ok = process.platform === 'darwin'
  ? darwinOk
  : result.ok === true && result.status === 'unsupported_platform';

const report = {
  schema: 'sks.sks-menubar-install-check.v1',
  ok,
  temp,
  env_home_temp: envHomeTemp,
  result,
  second_result: secondResult,
  restored_script_result: restoredScriptResult,
  stale_script_missing_entry_result: staleScriptMissingEntryResult,
  recovered_stale_script_result: recoveredStaleScriptResult,
  restored_executable_bit_result: restoredExecutableBitResult,
  env_home_result: envHomeResult,
  executable_exists: executableExists,
  launch_agent_exists: launchAgentExists,
  action_script_exists: actionScriptExists,
  build_stamp_exists: buildStampExists,
  generated_source_path: generatedSourcePath,
  has_visible_status_source: hasVisibleStatusSource,
  has_background_readonly_actions: hasBackgroundReadonlyActions,
  has_native_modal_source: hasNativeModalSource,
  has_action_log_source: hasActionLogSource,
  has_autosave_name_source: hasAutosaveNameSource,
  has_codex_lifecycle_source: hasCodexLifecycleSource,
  has_no_unconditional_keepalive: hasNoUnconditionalKeepAlive,
  has_no_launch_agent_secrets: hasNoLaunchAgentSecrets,
  has_interactive_process_type: hasInteractiveProcessType,
  has_package_plist_version: hasPackagePlistVersion,
  has_action_fallbacks: hasActionFallbacks,
  has_entry_warning: hasEntryWarning,
  has_build_stamp: hasBuildStamp,
  swift_parse: swiftParse,
  is_idempotent: isIdempotent,
  restores_missing_action_script: restoresMissingActionScript,
  blocks_stale_action_script_reuse: blocksStaleActionScriptReuse,
  recovers_stale_action_script_when_entry_exists: recoversStaleActionScriptWhenEntryExists,
  restores_executable_bit: restoresExecutableBit,
  has_command_registry: hasCommandRegistry,
  no_launchctl_secret_setenv: noLaunchctlSecretSetenv,
  has_launchctl_unsetenv: hasLaunchctlUnsetenv,
  launch_skipped_for_temp_home: launchSkippedForTempHome,
  launch_skipped_for_env_home: launchSkippedForEnvHome,
  launch_skipped_for_temp_install: launchSkippedForTempInstall,
  preferred_position_skipped_for_temp_install: preferredPositionSkippedForTempInstall,
  expected_menu_items: expectedMenuItems,
  missing_expected_items: missingExpectedItems,
  has_expected_items: hasExpectedItems,
  blockers: ok ? [] : ['sks_menubar_install_check_failed']
};

console.log(JSON.stringify(report, null, 2));
if (!ok) process.exit(1);

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function isExecutable(file: string | null | undefined): Promise<boolean> {
  if (!file) return false;
  try {
    await fs.access(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function swiftParseSmoke(sourcePath: string | null): Promise<{ ok: boolean; status: 'parsed' | 'skipped' | 'failed'; reason: string | null; code?: number | null; error?: string | null }> {
  if (process.platform !== 'darwin') return { ok: true, status: 'skipped', reason: 'not_macos' };
  const xcodeSelect = await which('xcode-select').catch(() => null) || '/usr/bin/xcode-select';
  const clt = await runProcess(xcodeSelect, ['-p'], { timeoutMs: 5_000, maxOutputBytes: 8 * 1024 })
    .catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }));
  if (clt.code !== 0) return { ok: true, status: 'skipped', reason: 'xcode_clt_missing', code: clt.code, error: String(clt.stderr || clt.stdout || '').trim() };
  if (!sourcePath) return { ok: false, status: 'failed', reason: 'source_missing' };
  const swiftc = await which('swiftc').catch(() => null) || '/usr/bin/swiftc';
  const parsed = await runProcess(swiftc, ['-parse', sourcePath], { timeoutMs: 30_000, maxOutputBytes: 32 * 1024 })
    .catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }));
  return {
    ok: parsed.code === 0,
    status: parsed.code === 0 ? 'parsed' : 'failed',
    reason: parsed.code === 0 ? null : 'swift_parse_failed',
    code: parsed.code,
    error: parsed.code === 0 ? null : String(parsed.stderr || parsed.stdout || '').trim()
  };
}
