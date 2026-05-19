import { statsCommand } from '../core/commands/gc-command.js';
export async function run(_command: any, args: any = []) { return statsCommand(args); }
