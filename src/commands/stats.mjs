import { statsCommand } from '../core/commands/gc-command.mjs';
export async function run(_command, args = []) { return statsCommand(args); }
