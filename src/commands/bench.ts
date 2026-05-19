import { benchCommand } from '../core/commands/bench-command.js';

export async function run(_command: any, args: any = []) {
  return benchCommand(args);
}
