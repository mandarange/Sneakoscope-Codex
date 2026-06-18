import { runMadGlmMode, type GlmModeResult } from './glm-mad-mode.js';

export async function runGlmReadinessAndExit(args: readonly string[] = []): Promise<GlmModeResult> {
  return runMadGlmMode(args);
}
