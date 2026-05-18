// @ts-nocheck
import { rollbackCommand } from '../core/commands/rollback-command.js';

export async function run(_command, args = []) {
  return rollbackCommand(args);
}
