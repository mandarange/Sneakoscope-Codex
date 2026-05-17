import { codeStructureCommand } from '../core/commands/code-structure-command.mjs';
export async function run(_command, args = []) {
  const [sub = 'scan', ...rest] = args;
  return codeStructureCommand(sub, rest);
}
