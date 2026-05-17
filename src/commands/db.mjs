import { dbCommand } from '../core/commands/db-command.mjs';

export async function run(_command, args = []) {
  const [sub = 'policy', ...rest] = args;
  return dbCommand(sub, rest);
}
