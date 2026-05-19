import { computerUseCommand } from '../core/commands/computer-use-command.js';

export async function run(command: any, args: any = []) {
  return computerUseCommand(command, args);
}
