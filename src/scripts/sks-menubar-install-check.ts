import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installSksMenuBar } from '../core/codex-app/sks-menubar.js';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-menubar-check-'));
const result = await installSksMenuBar({
  apply: true,
  launch: false,
  home: temp,
  root: temp,
  sksEntry: path.join(process.cwd(), 'dist', 'bin', 'sks.js')
});

const executableExists = result.executable_path ? await exists(result.executable_path) : false;
const launchAgentExists = result.launch_agent_path ? await exists(result.launch_agent_path) : false;
const actionScriptExists = result.action_script_path ? await exists(result.action_script_path) : false;
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
const ok = process.platform === 'darwin'
  ? result.ok === true
    && result.status === 'installed_launch_skipped'
    && executableExists
    && launchAgentExists
    && actionScriptExists
    && hasExpectedItems
  : result.ok === true && result.status === 'unsupported_platform';

const report = {
  schema: 'sks.sks-menubar-install-check.v1',
  ok,
  temp,
  result,
  executable_exists: executableExists,
  launch_agent_exists: launchAgentExists,
  action_script_exists: actionScriptExists,
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
