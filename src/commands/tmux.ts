// @ts-nocheck
import { tmuxCommand } from '../core/commands/basic-cli.js';
export async function run(_command, args = []) {
  const [sub = 'check', ...rest] = args;
  return tmuxCommand(sub, rest);
}
