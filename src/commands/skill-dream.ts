// @ts-nocheck
import { skillDreamCommand } from '../core/commands/skill-dream-command.js';
export async function run(_command, args = []) {
  const [sub = 'status', ...rest] = args;
  return skillDreamCommand(sub, rest);
}
