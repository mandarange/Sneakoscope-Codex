// @ts-nocheck
import { pathsCommand } from '../core/commands/paths-command.js';

export async function run(_command, args = []) {
  return pathsCommand(args);
}
