export interface NormalizedWorkerPromptText {
  text: string
  truncated: boolean
  dropped_chars: number
}

export const WORKER_PROMPT_TEXT_MAX_CHARS = 32000

export function normalizeWorkerPromptText(value: unknown): NormalizedWorkerPromptText {
  const normalized = String(value || '').replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  const truncated = normalized.length > WORKER_PROMPT_TEXT_MAX_CHARS
  const text = truncated ? normalized.slice(0, WORKER_PROMPT_TEXT_MAX_CHARS) : normalized
  return {
    text,
    truncated,
    dropped_chars: truncated ? normalized.length - WORKER_PROMPT_TEXT_MAX_CHARS : 0
  }
}
