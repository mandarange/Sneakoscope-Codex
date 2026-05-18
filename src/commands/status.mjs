import { statusCommand } from '../core/commands/status-command.mjs';

export async function run(_command, args = []) {
  return statusCommand(args);
}
