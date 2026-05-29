import { madHighCommand } from '../core/commands/mad-sks-command.js';
import { ensureMadLaunchDependencies, formatMadLaunchDependencyAction, maybePromptCodexUpdateForLaunch, maybePromptCodexLbSetupForLaunch } from '../cli/install-helpers.js';
import { PACKAGE_VERSION } from '../core/fsx.js';

export async function run(_command: any, args: any = []) {
  return madHighCommand(['--mad-sks', ...args], {
    maybePromptSksUpdateForLaunch: async () => ({ status: 'skipped' }),
    maybePromptCodexUpdateForLaunch,
    ensureMadLaunchDependencies,
    printDepsInstallAction: (action: any) => console.error(formatMadLaunchDependencyAction(action)),
    maybePromptCodexLbSetupForLaunch,
    packageVersion: PACKAGE_VERSION
  });
}
