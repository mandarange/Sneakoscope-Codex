import { projectRoot } from '../core/fsx.mjs';
import { bumpProjectVersion, disableVersionGitHook, versioningStatus } from '../core/version-manager.mjs';
import { flag } from '../cli/args.mjs';
import { printJson } from '../cli/output.mjs';
export async function run(_command, args = []) {
  const root = await projectRoot();
  const action = args[0] || 'status';
  const result = action === 'bump'
    ? await bumpProjectVersion(root, { force: true })
    : ['disable', 'off', 'remove-hook', 'unhook'].includes(action)
      ? await disableVersionGitHook(root)
      : await versioningStatus(root);
  if (flag(args, '--json')) return printJson(result);
  console.log(JSON.stringify(result, null, 2));
  if (result.ok === false) process.exitCode = 1;
}
