import { wikiCommand } from '../core/commands/wiki-command.mjs';

export async function run(_command, args = []) {
  const [sub = 'help', ...rest] = args;
  return wikiCommand(sub, rest);
}
