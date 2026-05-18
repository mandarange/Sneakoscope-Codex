// @ts-nocheck
import { depsCommand } from '../core/commands/basic-cli.js';
export async function run(_command, args = []) {
  const [sub = 'check', ...rest] = args;
  return depsCommand(sub, rest);
}
