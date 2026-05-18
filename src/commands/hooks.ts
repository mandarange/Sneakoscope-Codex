// @ts-nocheck
import { hooksCommand } from '../cli/feature-commands.js';

export async function run(_command, args = []) {
  const [sub, ...rest] = args;
  return hooksCommand(sub, rest);
}
