import { gxCommand } from '../core/commands/gx-command.js';
export async function run(_command: any, args: any = []) {
  const [sub = 'validate', ...rest] = args;
  return gxCommand(sub, rest);
}
