import { recallpulseCommand } from '../core/commands/recallpulse-command.mjs';

export async function run(_command, args = []) {
  const [sub = 'status', ...rest] = args;
  return recallpulseCommand(sub, rest);
}
