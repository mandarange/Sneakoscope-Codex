import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PACKAGE_VERSION } from '../core/fsx.js';
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
const commandRegistry = await fs.readFile(path.join(process.cwd(), 'src', 'cli', 'command-registry.ts'), 'utf8');
const installHelpers = await fs.readFile(path.join(process.cwd(), 'src', 'cli', 'install-helpers.ts'), 'utf8');

const hasVisibleStatusSource = generatedSource.includes('NSStatusItem.variableLength')
  && generatedSource.includes('configureStatusButton(button, title: state.title)')
  && generatedSource.includes('SKS ⚠')
  && generatedSource.includes('SKS ↑')
  && generatedSource.includes('Timer.scheduledTimer(withTimeInterval: 30.0');
const hasBackgroundReadonlyActions = generatedSource.includes('runSksBackground(["codex-lb", "fast-check"]')
  && generatedSource.includes('runSksBackground(["update", "check"]')
  && generatedSource.includes('display notification')
  && !generatedSource.includes('@objc func fastCheck() {\n        runSksInTerminal');
const hasTerminalFailureAlert = generatedSource.includes('output.contains("-1743")')
  && generatedSource.includes('Privacy & Security > Automation');
const hasTerminalExit = generatedSource.includes('; exit');
const hasAutosaveNameSource = generatedSource.includes('statusItem.autosaveName = "com.sneakoscope.sks-menubar"');
const hasExplicitVisibleSource = generatedSource.includes('statusItem.isVisible = true');
const hasNoUnconditionalKeepAlive = !launchAgentSource.includes('<key>KeepAlive</key>');
const hasNoLaunchAgentSecrets = !launchAgentSource.includes('EnvironmentVariables')
  && !launchAgentSource.includes('CODEX_LB_API_KEY')
  && !launchAgentSource.includes('OPENROUTER_API_KEY');
const hasInteractiveProcessType = launchAgentSource.includes('<key>ProcessType</key>')
  && launchAgentSource.includes('<string>Interactive</string>');
const hasPackagePlistVersion = infoPlist.includes(`<string>${PACKAGE_VERSION}</string>`)
  && infoPlist.includes('<key>CFBundleShortVersionString</key>')
  && infoPlist.includes('<key>CFBundleVersion</key>');
const hasActionFallbacks = actionScript.includes('.nvm/versions/node/*/bin/node(Nn[-1])')
  && actionScript.includes('/bin/zsh -lc')
  && actionScript.includes('command -v sks');
const hasEntryWarning = result.warnings.includes('sks_entry_project_local_ignored_global_package_used')
  || result.warnings.includes('sks_entry_resolved_under_project_root');
const hasBuildStamp = buildStampExists
  && result.build_stamp?.package_version === PACKAGE_VERSION
  && result.build_stamp?.codesign_identifier === 'com.sneakoscope.sks-menubar';
const isIdempotent = secondResult.actions.includes('menubar_up_to_date')
  && secondResult.build_stamp?.action_script_sha256 === result.build_stamp?.action_script_sha256;
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
  'Fast Check',
  'SKS Version Check',
  'Update SKS Now'
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
const ok = process.platform === 'darwin'
  ? result.ok === true
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
    && hasTerminalFailureAlert
    && hasTerminalExit
    && hasAutosaveNameSource
    && hasExplicitVisibleSource
    && hasNoUnconditionalKeepAlive
    && hasNoLaunchAgentSecrets
    && hasInteractiveProcessType
    && hasPackagePlistVersion
    && hasActionFallbacks
    && hasEntryWarning
    && hasBuildStamp
    && isIdempotent
    && hasCommandRegistry
    && noLaunchctlSecretSetenv
    && hasLaunchctlUnsetenv
    && launchSkippedForTempHome
    && launchSkippedForEnvHome
    && launchSkippedForTempInstall
    && preferredPositionSkippedForTempInstall
  : result.ok === true && result.status === 'unsupported_platform';

const report = {
  schema: 'sks.sks-menubar-install-check.v1',
  ok,
  temp,
  env_home_temp: envHomeTemp,
  result,
  second_result: secondResult,
  env_home_result: envHomeResult,
  executable_exists: executableExists,
  launch_agent_exists: launchAgentExists,
  action_script_exists: actionScriptExists,
  build_stamp_exists: buildStampExists,
  generated_source_path: generatedSourcePath,
  has_visible_status_source: hasVisibleStatusSource,
  has_background_readonly_actions: hasBackgroundReadonlyActions,
  has_terminal_failure_alert: hasTerminalFailureAlert,
  has_terminal_exit: hasTerminalExit,
  has_autosave_name_source: hasAutosaveNameSource,
  has_explicit_visible_source: hasExplicitVisibleSource,
  has_no_unconditional_keepalive: hasNoUnconditionalKeepAlive,
  has_no_launch_agent_secrets: hasNoLaunchAgentSecrets,
  has_interactive_process_type: hasInteractiveProcessType,
  has_package_plist_version: hasPackagePlistVersion,
  has_action_fallbacks: hasActionFallbacks,
  has_entry_warning: hasEntryWarning,
  has_build_stamp: hasBuildStamp,
  is_idempotent: isIdempotent,
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
