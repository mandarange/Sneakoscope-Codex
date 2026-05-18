// @ts-nocheck
import { computerUseCommand } from '../core/commands/computer-use-command.js';

export async function run(command, args = []) {
  return computerUseCommand(command, args);
}
