// @ts-nocheck
import { madHighCommand } from '../core/commands/mad-sks-command.js';
import { maybePromptCodexUpdateForLaunch, maybePromptCodexLbSetupForLaunch } from '../cli/install-helpers.js';
import { PACKAGE_VERSION } from '../core/fsx.js';

export async function run(_command, args = []) {
  return madHighCommand(['--mad-sks', ...args], {
    maybePromptSksUpdateForLaunch: async () => ({ status: 'skipped' }),
    maybePromptCodexUpdateForLaunch,
    ensureMadLaunchDependencies: async () => ({ ready: true, actions: [], status: {} }),
    printDepsInstallAction: (action) => console.log(JSON.stringify(action)),
    maybePromptCodexLbSetupForLaunch,
    packageVersion: PACKAGE_VERSION
  });
}
