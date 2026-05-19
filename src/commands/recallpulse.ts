import { recallpulseCommand } from '../core/commands/recallpulse-command.js';

export async function run(_command: any, args: any = []) {
  const [sub = 'status', ...rest] = args;
  return recallpulseCommand(sub, rest);
}
