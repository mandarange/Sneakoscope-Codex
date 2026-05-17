import { skillDreamCommand } from '../core/commands/route-cli.mjs';
export async function run(_command, args = []) {
  const [sub = 'status', ...rest] = args;
  return skillDreamCommand(sub, rest);
}
