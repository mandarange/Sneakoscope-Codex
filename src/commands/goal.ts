// @ts-nocheck
import { goalCommand } from '../core/commands/goal-command.js';
export async function run(_command, args = []) {
  const [sub, ...rest] = args;
  return goalCommand(sub, rest);
}
