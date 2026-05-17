import { scoutsCommand } from '../core/commands/scouts-command.mjs';

export async function run(_command, args = []) {
  return scoutsCommand(args);
}
