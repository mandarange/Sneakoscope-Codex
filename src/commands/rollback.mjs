import { rollbackCommand } from '../core/commands/rollback-command.mjs';

export async function run(_command, args = []) {
  return rollbackCommand(args);
}
