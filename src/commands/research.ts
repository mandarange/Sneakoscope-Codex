import { researchCommand } from '../core/commands/research-command.js';
export async function run(_command: any, args: any = []) {
  const [sub, ...rest] = args;
  return researchCommand(sub, rest);
}
