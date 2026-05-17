import { statsCommand } from '../core/commands/route-cli.mjs';
export async function run(_command, args = []) { return statsCommand(args); }
