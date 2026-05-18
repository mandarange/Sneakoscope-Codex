// @ts-nocheck
import { wikiCommand } from '../core/commands/wiki-command.js';

export async function run(_command, args = []) {
  const [sub = 'help', ...rest] = args;
  return wikiCommand(sub, rest);
}
