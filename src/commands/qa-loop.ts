import { qaLoopCommand } from '../core/commands/qa-loop-command.js';
export async function run(_command: any, args: any = []) {
  const [sub, ...rest] = args;
  return qaLoopCommand(sub, rest);
}
