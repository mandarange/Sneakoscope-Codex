import { dbCommand } from '../core/commands/route-cli.mjs';

export async function run(_command, args = []) {
  const [sub = 'policy', ...rest] = args;
  return dbCommand(sub, rest);
}
