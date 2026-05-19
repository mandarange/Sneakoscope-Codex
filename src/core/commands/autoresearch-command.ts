import { researchCommand } from './research-command.js';

export async function autoresearchCommand(sub: any, args: any = []) {
  return researchCommand(sub || 'status', args);
}
