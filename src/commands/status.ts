import { statusCommand } from '../core/commands/status-command.js';

export async function run(_command: any, args: any = []) {
  return statusCommand(args);
}
