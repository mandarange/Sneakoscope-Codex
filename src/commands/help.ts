import { commandsCommand, helpCommand } from '../core/commands/basic-cli.js';

export async function run(command: string, args: string[] = []): Promise<unknown> {
  if (command === 'commands') return commandsCommand(args);
  return helpCommand(args);
}
