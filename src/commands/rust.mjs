import { rustCommand } from '../core/commands/rust-command.mjs';

export async function run(_command, args = []) {
  return rustCommand(args);
}
