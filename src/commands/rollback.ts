import { rollbackCommand } from '../core/commands/rollback-command.js';

export async function run(_command: any, args: any = []) {
  return rollbackCommand(args);
}
