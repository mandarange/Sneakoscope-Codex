import { context7Command } from '../cli/context7-command.mjs';
export async function run(_command, args = []) {
  const [sub = 'check', ...rest] = args;
  return context7Command(sub, rest);
}
