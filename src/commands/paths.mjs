import { pathsCommand } from '../core/commands/paths-command.mjs';

export async function run(_command, args = []) {
  return pathsCommand(args);
}
