import { hermesCommand } from '../cli/hermes-command.js';

export async function run(_command: any, args: any = []) {
  return hermesCommand(args);
}
