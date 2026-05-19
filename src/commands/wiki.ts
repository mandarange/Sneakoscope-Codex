import { wikiCommand } from '../core/commands/wiki-command.js';

export async function run(_command: any, args: any = []) {
  const [sub = 'help', ...rest] = args;
  return wikiCommand(sub, rest);
}
