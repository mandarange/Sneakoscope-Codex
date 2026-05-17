import { bootstrapCommand } from '../core/commands/basic-cli.mjs';
export async function run(_command, args = []) { return bootstrapCommand(args); }
