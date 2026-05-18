import { trustCommand } from '../core/commands/trust-command.mjs';

export async function run(_command, args = []) {
  return trustCommand(args);
}
