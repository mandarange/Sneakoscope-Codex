import { projectRoot } from '../core/fsx.mjs';
import { harnessGuardStatus } from '../core/harness-guard.mjs';
import { flag } from '../cli/args.mjs';
import { printJson } from '../cli/output.mjs';
export async function run(_command, args = []) {
  const result = await harnessGuardStatus(await projectRoot());
  if (flag(args, '--json')) return printJson(result);
  console.log(`Harness guard: ${result.ok ? 'ok' : 'blocked'}`);
  if (!result.ok) process.exitCode = 1;
}
