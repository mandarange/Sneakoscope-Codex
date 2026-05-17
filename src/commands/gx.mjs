import { gxCommand } from '../core/commands/route-cli.mjs';
export async function run(_command, args = []) {
  const [sub = 'validate', ...rest] = args;
  return gxCommand(sub, rest);
}
