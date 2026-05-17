import { recallPulseCommand } from '../../cli/recallpulse-command.mjs';

export async function recallpulseCommand(sub, args = []) {
  return recallPulseCommand(sub || 'status', args);
}
