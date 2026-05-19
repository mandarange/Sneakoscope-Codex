import { autoresearchCommand } from '../core/commands/autoresearch-command.js';
export async function run(_command: any, args: any = []) {
  const [sub = 'status', ...rest] = args;
  return autoresearchCommand(sub, rest);
}
