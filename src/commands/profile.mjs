import { profileCommand } from '../core/commands/route-cli.mjs';
export async function run(_command, args = []) {
  const [sub = 'show', ...rest] = args;
  return profileCommand(sub, rest);
}
