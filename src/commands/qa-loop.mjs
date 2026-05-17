import { qaLoopCommand } from '../core/commands/qa-loop-command.mjs';
export async function run(_command, args = []) {
  const [sub, ...rest] = args;
  return qaLoopCommand(sub, rest);
}
