import { hproofCommand } from '../core/commands/hproof-command.mjs';
export async function run(_command, args = []) {
  const [sub = 'check', ...rest] = args;
  return hproofCommand(sub, rest);
}
