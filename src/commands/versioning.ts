import { projectRoot } from '../core/fsx.js';
import { bumpProjectVersion, disableVersionGitHook, versioningStatus } from '../core/version-manager.js';
import { flag } from '../cli/args.js';
import { printJson } from '../cli/output.js';
export async function run(_command: any, args: any = []) {
  const root = await projectRoot();
  const action = args[0] || 'status';
  const bump = ['major', 'minor', 'patch'].includes(String(args[1] || '')) ? String(args[1]) : null;
  const result = action === 'bump'
    ? await bumpProjectVersion(root, { force: true, bump })
    : ['disable', 'off', 'remove-hook', 'unhook'].includes(action)
      ? await disableVersionGitHook(root)
      : await versioningStatus(root);
  if (flag(args, '--json')) return printJson(result);
  console.log(JSON.stringify(result, null, 2));
  if (result.ok === false) process.exitCode = 1;
}
