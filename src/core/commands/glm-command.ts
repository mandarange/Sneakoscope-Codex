import { runMadGlmMode } from '../providers/glm/glm-mad-mode.js';

export async function glmCommand(args: string[] = []) {
  return runMadGlmMode(args);
}
