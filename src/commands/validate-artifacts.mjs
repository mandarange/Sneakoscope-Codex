import { validateArtifactsCommand } from '../core/commands/route-cli.mjs';
export async function run(_command, args = []) { return validateArtifactsCommand(args); }
