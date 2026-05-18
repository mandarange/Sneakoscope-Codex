// @ts-nocheck
import { commandsCommand, helpCommand } from '../core/commands/basic-cli.js';

export async function run(command, args = []) {
  if (command === 'commands') return commandsCommand(args);
  return helpCommand(args);
}
