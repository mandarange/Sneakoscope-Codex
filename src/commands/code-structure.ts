import { codeStructureCommand } from '../core/commands/code-structure-command.js';
export async function run(_command: any, args: any = []) {
  const [sub = 'scan', ...rest] = args;
  return codeStructureCommand(sub, rest);
}
