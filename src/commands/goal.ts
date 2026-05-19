import { goalCommand } from '../core/commands/goal-command.js';
export async function run(_command: any, args: any = []) {
  const [sub, ...rest] = args;
  return goalCommand(sub, rest);
}
