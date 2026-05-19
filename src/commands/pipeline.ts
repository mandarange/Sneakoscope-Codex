import { pipelineCommand } from '../core/commands/pipeline-command.js';

export async function run(_command: any, args: any = []) {
  return pipelineCommand(args);
}
