import { scoutsCommand } from '../core/commands/scouts-command.js';

export async function run(_command: any, args: any = []) {
  return scoutsCommand(args);
}
