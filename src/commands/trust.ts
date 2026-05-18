// @ts-nocheck
import { trustCommand } from '../core/commands/trust-command.js';

export async function run(_command, args = []) {
  return trustCommand(args);
}
