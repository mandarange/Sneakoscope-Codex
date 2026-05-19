import { gitCommand } from '../core/commands/git-command.js';

export async function run(_command: string, args: string[] = []) {
  return gitCommand(args);
}

