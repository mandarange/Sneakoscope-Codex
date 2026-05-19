import { validateArtifactsCommand } from '../core/commands/validate-artifacts-command.js';
export async function run(_command: any, args: any = []) { return validateArtifactsCommand(args); }
