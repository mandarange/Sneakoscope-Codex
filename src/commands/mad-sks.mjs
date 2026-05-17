import { madHighCommand } from '../core/commands/mad-sks-command.mjs';
import { maybePromptCodexUpdateForLaunch, maybePromptCodexLbSetupForLaunch } from '../cli/install-helpers.mjs';
import { PACKAGE_VERSION } from '../core/fsx.mjs';

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
