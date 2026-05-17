import { evalCommand } from '../core/commands/route-cli.mjs';
export async function run(_command, args = []) {
  const [sub = 'run', ...rest] = args;
  return evalCommand(sub, rest);
}
