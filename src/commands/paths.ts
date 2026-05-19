import { pathsCommand } from '../core/commands/paths-command.js';

export async function run(_command: any, args: any = []) {
  return pathsCommand(args);
}
