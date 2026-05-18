// @ts-nocheck
import { pipelineCommand } from '../core/commands/pipeline-command.js';

export async function run(_command, args = []) {
  return pipelineCommand(args);
}
