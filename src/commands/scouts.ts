// @ts-nocheck
import { scoutsCommand } from '../core/commands/scouts-command.js';

export async function run(_command, args = []) {
  return scoutsCommand(args);
}
