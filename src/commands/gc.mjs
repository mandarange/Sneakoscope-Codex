import { gcCommand } from '../core/commands/gc-command.mjs';
export async function run(_command, args = []) { return gcCommand(args); }
