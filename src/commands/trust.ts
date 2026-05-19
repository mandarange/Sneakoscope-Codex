import { trustCommand } from '../core/commands/trust-command.js';

export async function run(_command: any, args: any = []) {
  return trustCommand(args);
}
