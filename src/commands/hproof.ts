import { hproofCommand } from '../core/commands/hproof-command.js';
export async function run(_command: any, args: any = []) {
  const [sub = 'check', ...rest] = args;
  return hproofCommand(sub, rest);
}
