export interface PromptPlaceholderGuardResult {
  schema: 'sks.prompt-placeholder-guard.v1'
  ok: boolean
  write_capable: boolean
  placeholders: string[]
  empty_target_paths: boolean
  blockers: string[]
  warnings: string[]
}

const PLACEHOLDER_PATTERNS: RegExp[] = [
  /@filename\b/i,
  /<file>/i,
  /\bTODO_PATH\b/i,
  /\bINSERT_PATH_HERE\b/i,
  /\/path\/to\/file\b/i
]

export function checkPromptPlaceholders(input: {
  prompt?: string
  writeCapable?: boolean
  targetPaths?: string[]
} = {}): PromptPlaceholderGuardResult {
  const prompt = String(input.prompt || '')
  const writeCapable = input.writeCapable === true
  const placeholders = PLACEHOLDER_PATTERNS
    .filter((pattern) => pattern.test(prompt))
    .map((pattern) => pattern.source)
  const emptyTargetPaths = writeCapable && (!Array.isArray(input.targetPaths) || input.targetPaths.length === 0)
  const blockers = writeCapable ? [
    ...placeholders.map((placeholder) => `unresolved_prompt_placeholder:${placeholder}`),
    ...(emptyTargetPaths ? ['write_capable_prompt_target_paths_empty'] : [])
  ] : []
  const warnings = writeCapable ? [] : placeholders.map((placeholder) => `readonly_prompt_placeholder_warning:${placeholder}`)
  return {
    schema: 'sks.prompt-placeholder-guard.v1',
    ok: blockers.length === 0,
    write_capable: writeCapable,
    placeholders,
    empty_target_paths: emptyTargetPaths,
    blockers,
    warnings
  }
}

