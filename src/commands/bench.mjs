import { benchCommand } from '../core/commands/bench-command.mjs';

export async function run(_command, args = []) {
  return benchCommand(args);
}
