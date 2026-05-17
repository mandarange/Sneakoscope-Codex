import { qaLoopCommand } from '../core/commands/route-cli.mjs';
export async function run(_command, args = []) {
  const [sub, ...rest] = args;
  return qaLoopCommand(sub, rest);
}
