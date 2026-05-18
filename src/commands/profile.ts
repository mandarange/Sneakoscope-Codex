// @ts-nocheck
import { profileCommand } from '../core/commands/profile-command.js';
export async function run(_command, args = []) {
  const [sub = 'show', ...rest] = args;
  return profileCommand(sub, rest);
}
