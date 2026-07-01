import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installSksMenuBar } from '../core/codex-app/sks-menubar.js';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-menubar-check-'));
const envHomeTemp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-menubar-env-home-check-'));
const launchGuardEnv = { ...process.env, SKS_SKIP_SKS_MENUBAR_LAUNCH: '0' };
const result = await installSksMenuBar({
  apply: true,
  launch: true,
  home: temp,
  root: temp,
  sksEntry: path.join(process.cwd(), 'dist', 'bin', 'sks.js'),
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
const generatedSourcePath = result.app_path ? path.join(path.dirname(result.app_path), 'SKSMenuBar.swift') : null;
const generatedSource = generatedSourcePath ? await fs.readFile(generatedSourcePath, 'utf8').catch(() => '') : '';
const launchAgentSource = result.launch_agent_path ? await fs.readFile(result.launch_agent_path, 'utf8').catch(() => '') : '';
const hasVisibleLabelSource = generatedSource.includes('NSStatusItem.variableLength')
  && generatedSource.includes('button.title = "SKS"')
  && generatedSource.includes('button.attributedTitle = NSAttributedString(string: "SKS"')
  && generatedSource.includes('NSColor.labelColor')
  && generatedSource.includes('button.image = nil');
// The status item must persist its user-arranged position across restarts so a
// once-dragged item does not jump back behind the notch on the next doctor --fix.
const hasAutosaveNameSource = generatedSource.includes('statusItem.autosaveName = "com.sneakoscope.sks-menubar"');
const hasExplicitVisibleSource = generatedSource.includes('statusItem.isVisible = true');
const terminalCommandLine = generatedSource.split(/\r?\n/)
  .find((line) => line.includes('do script') && line.includes('escaped')) || '';
const hasTerminalCommandInterpolation = terminalCommandLine.includes(String.raw`\(escaped)`)
  && !terminalCommandLine.includes(String.raw`\"(escaped)\"`);
const hasNoUnconditionalKeepAlive = !launchAgentSource.includes('<key>KeepAlive</key>');
const hasInteractiveProcessType = launchAgentSource.includes('<key>ProcessType</key>')
  && launchAgentSource.includes('<string>Interactive</string>');
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
// Temp-path guard: a temp-rooted install must never request a launch, even if
// some caller forgets SKS_SKIP_SKS_MENUBAR_LAUNCH. Both fixtures live under
// os.tmpdir(), so both results must carry the temp-install skip warning.
const launchSkippedForTempInstall = result.launch?.requested === false
  && result.warnings.includes('launch_skipped_temp_install')
  && envHomeResult.launch?.requested === false
  && envHomeResult.warnings.includes('launch_skipped_temp_install');
const preferredPositionSkippedForTempInstall = !result.actions.includes('seeded SKS menu bar preferred position')
  && !envHomeResult.actions.includes('seeded SKS menu bar preferred position');
const ok = process.platform === 'darwin'
  ? result.ok === true
    && result.status === 'installed_launch_skipped'
    && envHomeResult.ok === true
    && envHomeResult.status === 'installed_launch_skipped'
    && executableExists
    && launchAgentExists
    && actionScriptExists
    && hasExpectedItems
    && hasVisibleLabelSource
    && hasAutosaveNameSource
    && hasExplicitVisibleSource
    && hasTerminalCommandInterpolation
    && hasNoUnconditionalKeepAlive
    && hasInteractiveProcessType
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
  env_home_result: envHomeResult,
  executable_exists: executableExists,
  launch_agent_exists: launchAgentExists,
  action_script_exists: actionScriptExists,
  generated_source_path: generatedSourcePath,
  terminal_command_line: terminalCommandLine,
  has_visible_label_source: hasVisibleLabelSource,
  has_autosave_name_source: hasAutosaveNameSource,
  has_explicit_visible_source: hasExplicitVisibleSource,
  has_terminal_command_interpolation: hasTerminalCommandInterpolation,
  has_no_unconditional_keepalive: hasNoUnconditionalKeepAlive,
  has_interactive_process_type: hasInteractiveProcessType,
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
