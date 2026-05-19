import { evalCommand } from '../core/commands/eval-command.js';
export async function run(_command: any, args: any = []) {
  const [sub = 'run', ...rest] = args;
  return evalCommand(sub, rest);
}
