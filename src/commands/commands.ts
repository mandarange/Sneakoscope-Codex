// @ts-nocheck
import { commandsCommand } from '../core/commands/basic-cli.js';

export async function run(_command, args = []) {
  return commandsCommand(args);
}
