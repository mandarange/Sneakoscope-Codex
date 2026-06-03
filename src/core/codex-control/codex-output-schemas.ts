import { CODEX_AGENT_WORKER_RESULT_SCHEMA_ID, codexAgentWorkerResultSchema } from './schemas/agent-worker-result.schema.js'

export const CODEX_OUTPUT_SCHEMA_IDS = [
  CODEX_AGENT_WORKER_RESULT_SCHEMA_ID,
  'sks.patch-envelope-result.v1',
  'sks.verification-result.v1',
  'sks.research-digest.v1',
  'sks.release-failure-analysis.v1',
  'sks.ux-ppt-review-result.v1',
  'sks.core-skill-heldout-validation.v1'
] as const

export function resolveCodexOutputSchema(schemaId: string, fallback?: Record<string, unknown>): Record<string, unknown> {
  if (schemaId === CODEX_AGENT_WORKER_RESULT_SCHEMA_ID) return codexAgentWorkerResultSchema as Record<string, unknown>
  if (fallback && typeof fallback === 'object') return fallback
  return {
    type: 'object',
    required: ['status', 'summary', 'blockers'],
    properties: {
      status: { type: 'string' },
      summary: { type: 'string' },
      blockers: { type: 'array', items: { type: 'string' } }
    },
    additionalProperties: false
  }
}
