import { researchCommand } from '../core/commands/route-cli.mjs';
export async function run(_command, args = []) {
  const [sub = 'status', ...rest] = args;
  return researchCommand(sub, rest);
}
