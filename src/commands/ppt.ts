import { pptCommand } from '../core/commands/ppt-command.js';

export async function run(command: any, args: any = []) {
  return pptCommand(command, args);
}
