import { openClawCommand } from '../cli/openclaw-command.mjs';
export async function run(_command, args = []) { return openClawCommand(args); }
