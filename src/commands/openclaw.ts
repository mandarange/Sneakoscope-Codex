import { openClawCommand } from '../cli/openclaw-command.js';
export async function run(_command: any, args: any = []) { return openClawCommand(args); }
