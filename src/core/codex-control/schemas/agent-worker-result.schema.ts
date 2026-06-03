export const CODEX_AGENT_WORKER_RESULT_SCHEMA_ID = 'sks.agent-worker-result.v1'

export const codexAgentWorkerResultSchema = {
  type: 'object',
  required: [
    'status',
    'summary',
    'findings',
    'changed_files',
    'patch_envelopes',
    'verification',
    'rollback_notes',
    'blockers'
  ],
  properties: {
    status: { enum: ['done', 'failed', 'blocked'] },
    summary: { type: 'string' },
    findings: { type: 'array' },
    changed_files: { type: 'array' },
    patch_envelopes: { type: 'array' },
    verification: { type: 'object' },
    rollback_notes: { type: 'array' },
    blockers: { type: 'array' }
  },
  additionalProperties: true
} as const
