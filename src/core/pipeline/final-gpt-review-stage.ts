import { runGptFinalArbiter } from '../codex-control/gpt-final-arbiter.js'
import type { GptFinalArbiterInput } from '../codex-control/gpt-final-proof-pack.js'

export async function runFinalGptReviewStage(input: GptFinalArbiterInput, opts: Parameters<typeof runGptFinalArbiter>[1] = {}) {
  return runGptFinalArbiter(input, opts)
}
