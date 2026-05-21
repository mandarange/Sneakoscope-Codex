import { dfixCommand } from '../core/commands/dfix-command.js';

export async function run(command: any, args: any = []) {
  return dfixCommand(args);
}
