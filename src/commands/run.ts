// @ts-nocheck
import { runCommand } from '../core/commands/run-command.js';

export async function run(_command, args = []) {
  return runCommand(args);
}
