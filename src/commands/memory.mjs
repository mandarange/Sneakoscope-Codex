import { memoryCommand } from '../core/commands/route-cli.mjs';
export async function run(_command, args = []) {
  const [sub, ...rest] = args;
  return memoryCommand(sub, rest);
}
