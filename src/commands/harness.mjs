import { harnessCommand } from '../core/commands/route-cli.mjs';
export async function run(_command, args = []) {
  const [sub = 'fixture', ...rest] = args;
  return harnessCommand(sub, rest);
}
