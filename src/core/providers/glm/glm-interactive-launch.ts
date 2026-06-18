import { madHighCommand } from '../../commands/mad-sks-command.js';
import type { GlmModeResult } from './glm-mad-mode.js';

export async function runGlmInteractiveLaunch(args: readonly string[], readiness: GlmModeResult): Promise<unknown> {
  return madHighCommand(['--glm', '--no-swarm', ...args], { glmReadiness: readiness, glmArgs: args });
}
