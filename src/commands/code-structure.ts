// @ts-nocheck
import { codeStructureCommand } from '../core/commands/code-structure-command.js';
export async function run(_command, args = []) {
  const [sub = 'scan', ...rest] = args;
  return codeStructureCommand(sub, rest);
}
