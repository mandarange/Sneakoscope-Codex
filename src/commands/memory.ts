import { memoryCommand } from '../core/commands/gc-command.js';
export async function run(_command: any, args: any = []) {
  const [sub, ...rest] = args;
  return memoryCommand(sub, rest);
}
