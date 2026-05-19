import { profileCommand } from '../core/commands/profile-command.js';
export async function run(_command: any, args: any = []) {
  const [sub = 'show', ...rest] = args;
  return profileCommand(sub, rest);
}
