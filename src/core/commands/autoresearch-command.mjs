import { researchCommand } from './research-command.mjs';

export async function autoresearchCommand(sub, args = []) {
  return researchCommand(sub || 'status', args);
}
