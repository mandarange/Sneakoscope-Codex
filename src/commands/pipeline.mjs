import { pipelineCommand } from '../core/commands/pipeline-command.mjs';

export async function run(_command, args = []) {
  return pipelineCommand(args);
}
