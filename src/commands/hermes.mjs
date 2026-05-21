import { hermesCommand } from '../cli/hermes-command.mjs';

export async function run(_command, args = []) {
  return hermesCommand(args);
}
