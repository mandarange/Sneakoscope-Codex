// @ts-nocheck
import { statusCommand } from '../core/commands/status-command.js';

export async function run(_command, args = []) {
  return statusCommand(args);
}
