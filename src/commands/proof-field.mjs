import { proofFieldCommand } from '../core/commands/route-cli.mjs';
export async function run(_command, args = []) {
  const [sub = 'scan', ...rest] = args;
  return proofFieldCommand(sub, rest);
}
