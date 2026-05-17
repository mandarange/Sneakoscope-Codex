import { computerUseCommand } from '../core/commands/computer-use-command.mjs';

export async function run(command, args = []) {
  return computerUseCommand(command, args);
}
