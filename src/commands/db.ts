// @ts-nocheck
import { dbCommand } from '../core/commands/db-command.js';

export async function run(_command, args = []) {
  const [sub = 'policy', ...rest] = args;
  return dbCommand(sub, rest);
}
