import { recallPulseCommand } from '../cli/recallpulse-command.mjs';
export async function run(_command, args = []) {
  const [sub = 'status', ...rest] = args;
  return recallPulseCommand(sub, rest);
}
