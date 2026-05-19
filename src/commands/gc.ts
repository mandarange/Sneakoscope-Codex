import { gcCommand } from '../core/commands/gc-command.js';
export async function run(_command: any, args: any = []) { return gcCommand(args); }
