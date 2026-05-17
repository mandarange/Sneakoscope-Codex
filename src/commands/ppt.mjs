import { pptCommand } from '../core/commands/ppt-command.mjs';

export async function run(command, args = []) {
  return pptCommand(command, args);
}
