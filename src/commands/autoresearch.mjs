import { autoresearchCommand } from '../core/commands/autoresearch-command.mjs';
export async function run(_command, args = []) {
  const [sub = 'status', ...rest] = args;
  return autoresearchCommand(sub, rest);
}
