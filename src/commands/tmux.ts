import { tmuxCommand } from '../core/commands/basic-cli.js';
export async function run(_command: any, args: any = []) {
  const [sub = 'check', ...rest] = args;
  return tmuxCommand(sub, rest);
}
