// @ts-nocheck
import { proofFieldCommand } from '../core/commands/proof-field-command.js';
export async function run(_command, args = []) {
  const [sub = 'scan', ...rest] = args;
  return proofFieldCommand(sub, rest);
}
