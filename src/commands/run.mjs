import { runCommand } from '../core/commands/run-command.mjs';

export async function run(_command, args = []) {
  return runCommand(args);
}
