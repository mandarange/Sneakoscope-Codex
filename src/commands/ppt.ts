// @ts-nocheck
import { pptCommand } from '../core/commands/ppt-command.js';

export async function run(command, args = []) {
  return pptCommand(command, args);
}
