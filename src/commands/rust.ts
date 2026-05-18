// @ts-nocheck
import { rustCommand } from '../core/commands/rust-command.js';

export async function run(_command, args = []) {
  return rustCommand(args);
}
