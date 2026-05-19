import { projectRoot } from '../core/fsx.js';
import { harnessGuardStatus } from '../core/harness-guard.js';
import { flag } from '../cli/args.js';
import { printJson } from '../cli/output.js';
export async function run(_command: any, args: any = []) {
  const result = await harnessGuardStatus(await projectRoot());
  if (flag(args, '--json')) return printJson(result);
  console.log(`Harness guard: ${result.ok ? 'ok' : 'blocked'}`);
  if (!result.ok) process.exitCode = 1;
}
