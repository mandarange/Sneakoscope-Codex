import { harnessCommand } from '../core/commands/harness-command.js';
export async function run(_command: any, args: any = []) {
  const [sub = 'fixture', ...rest] = args;
  return harnessCommand(sub, rest);
}
