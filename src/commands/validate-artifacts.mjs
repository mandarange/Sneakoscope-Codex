import { validateArtifactsCommand } from '../core/commands/validate-artifacts-command.mjs';
export async function run(_command, args = []) { return validateArtifactsCommand(args); }
