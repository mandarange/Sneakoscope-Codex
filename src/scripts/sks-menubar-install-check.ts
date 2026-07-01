import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installSksMenuBar } from '../core/codex-app/sks-menubar.js';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-menubar-check-'));
const envHomeTemp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-menubar-env-home-check-'));
const result = await installSksMenuBar({
  apply: true,
  launch: true,
  home: temp,
  root: temp,
  sksEntry: path.join(process.cwd(), 'dist', 'bin', 'sks.js')
});
const envHomeResult = await installSksMenuBar({
  apply: true,
  launch: true,
  root: envHomeTemp,
  sksEntry: path.join(process.cwd(), 'dist', 'bin', 'sks.js'),
  env: { ...process.env, HOME: envHomeTemp }
});

const executableExists = result.executable_path ? await exists(result.executable_path) : false;
const launchAgentExists = result.launch_agent_path ? await exists(result.launch_agent_path) : false;
const actionScriptExists = result.action_script_path ? await exists(result.action_script_path) : false;
const generatedSourcePath = result.app_path ? path.join(path.dirname(result.app_path), 'SKSMenuBar.swift') : null;
const generatedSource = generatedSourcePath ? await fs.readFile(generatedSourcePath, 'utf8').catch(() => '') : '';
const hasVisibleLabelSource = generatedSource.includes('NSStatusItem.variableLength')
  && generatedSource.includes('button.title = "SKS"')
  && generatedSource.includes('button.image = nil');
const expectedMenuItems = [
  'Use codex-lb',
  'Use ChatGPT OAuth',
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
    && launchSkippedForTempHome
    && launchSkippedForEnvHome
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
  has_visible_label_source: hasVisibleLabelSource,
  launch_skipped_for_temp_home: launchSkippedForTempHome,
  launch_skipped_for_env_home: launchSkippedForEnvHome,
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
