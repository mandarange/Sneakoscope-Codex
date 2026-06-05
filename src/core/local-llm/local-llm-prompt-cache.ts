import { buildLocalLlmContextCacheKey } from './local-llm-context-cache.js'

export function buildLocalLlmPromptCacheRecord(input: {
  routeSystemEnvelopeHash: string
  localWorkerPolicyHash: string
  coreSkillSnapshotHash: string
  triwikiContextPackHash: string
  repoSummaryHash: string
  capabilityCardHash: string
}) {
  const key = buildLocalLlmContextCacheKey(input)
  return {
    schema: 'sks.local-llm-prompt-cache.v1',
    cache_key: key.key,
    source_hashes: input,
    cacheable: Object.values(input).every(Boolean),
    forbidden_material: ['secrets', 'auth tokens', 'raw private config']
  }
}
