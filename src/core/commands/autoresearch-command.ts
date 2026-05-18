// @ts-nocheck
import { researchCommand } from './research-command.js';

export async function autoresearchCommand(sub, args = []) {
  return researchCommand(sub || 'status', args);
}
