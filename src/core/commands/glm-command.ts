import { runMadGlmMode } from '../providers/glm/glm-mad-mode.js';
import { flag } from '../../cli/args.js';
import { madHighCommand } from './mad-sks-command.js';

export async function glmCommand(args: string[] = []) {
  const result = await runMadGlmMode(args);
  if (!result.ok || flag(args, '--repair') || flag(args, '--json')) return result;
  return madHighCommand(['--glm', ...args], { glmReadiness: result });
}
