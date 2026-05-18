// @ts-nocheck
import { memoryCommand } from '../core/commands/gc-command.js';
export async function run(_command, args = []) {
  const [sub, ...rest] = args;
  return memoryCommand(sub, rest);
}
