import { recallPulseCommand } from '../../cli/recallpulse-command.js';

export async function recallpulseCommand(sub: any, args: any = []) {
  return recallPulseCommand(sub || 'status', args);
}
