import { dbCommand } from '../cli/maintenance-commands.mjs';

export async function run(_command, args = []) {
  const [sub = 'policy', ...rest] = args;
  return dbCommand(sub, rest);
}
