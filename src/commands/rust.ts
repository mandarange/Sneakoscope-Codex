import { rustCommand } from '../core/commands/rust-command.js';

export async function run(_command: any, args: any = []) {
  return rustCommand(args);
}
