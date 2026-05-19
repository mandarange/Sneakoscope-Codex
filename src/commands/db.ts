import { dbCommand } from '../core/commands/db-command.js';

export async function run(_command: any, args: any = []) {
  const [sub = 'policy', ...rest] = args;
  return dbCommand(sub, rest);
}
