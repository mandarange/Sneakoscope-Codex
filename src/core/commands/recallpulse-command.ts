// @ts-nocheck
import { recallPulseCommand } from '../../cli/recallpulse-command.js';

export async function recallpulseCommand(sub, args = []) {
  return recallPulseCommand(sub || 'status', args);
}
