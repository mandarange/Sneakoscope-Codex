import { usageCommand } from '../core/commands/basic-cli.js';
export async function run(_command: any, args: any = []) { return usageCommand(args); }
