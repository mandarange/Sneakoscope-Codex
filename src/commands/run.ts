import { runCommand } from '../core/commands/run-command.js';

export async function run(_command: any, args: any = []) {
  return runCommand(args);
}
