// @ts-nocheck
import { benchCommand } from '../core/commands/bench-command.js';

export async function run(_command, args = []) {
  return benchCommand(args);
}
