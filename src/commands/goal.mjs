import { goalCommand } from '../core/commands/goal-command.mjs';
export async function run(_command, args = []) {
  const [sub, ...rest] = args;
  return goalCommand(sub, rest);
}
