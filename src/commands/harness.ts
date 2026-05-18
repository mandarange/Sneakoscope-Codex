// @ts-nocheck
import { harnessCommand } from '../core/commands/harness-command.js';
export async function run(_command, args = []) {
  const [sub = 'fixture', ...rest] = args;
  return harnessCommand(sub, rest);
}
