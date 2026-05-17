import { gcCommand } from '../core/commands/route-cli.mjs';
export async function run(_command, args = []) { return gcCommand(args); }
