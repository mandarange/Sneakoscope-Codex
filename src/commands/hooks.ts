import { hooksCommand } from '../cli/feature-commands.js';

export async function run(_command: any, args: any = []) {
  const [sub, ...rest] = args;
  return hooksCommand(sub, rest);
}
