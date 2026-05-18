// @ts-nocheck
import { evalCommand } from '../core/commands/eval-command.js';
export async function run(_command, args = []) {
  const [sub = 'run', ...rest] = args;
  return evalCommand(sub, rest);
}
