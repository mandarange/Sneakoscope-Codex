export const CODEX_AGENT_WORKER_RESULT_SCHEMA_ID = 'sks.agent-worker-result.v1'

const patchOperationSchema = {
  type: 'object',
  required: ['op', 'path', 'search', 'replace', 'content', 'diff'],
  properties: {
    op: { type: 'string', enum: ['replace', 'write', 'unified_diff', 'git_apply_patch'] },
    path: { type: 'string' },
    search: { type: 'string' },
    replace: { type: 'string' },
    content: { type: 'string' },
    diff: { type: 'string' }
  },
  additionalProperties: false
} as const

const patchEnvelopeSchema = {
  type: 'object',
  required: [
    'schema',
    'source',
    'agent_id',
    'session_id',
    'slot_id',
    'generation_index',
    'task_slice_id',
    'lease_id',
    'allowed_paths',
    'operations',
    'rationale'
  ],
  properties: {
    schema: { type: 'string', enum: ['sks.agent-patch-envelope.v1'] },
    source: { type: 'string', enum: ['model_authored'] },
    agent_id: { type: 'string' },
    session_id: { type: 'string' },
    slot_id: { type: 'string' },
    generation_index: { type: 'number' },
    task_slice_id: { type: 'string' },
    lease_id: { type: 'string' },
    allowed_paths: { type: 'array', items: { type: 'string' } },
    operations: { type: 'array', items: patchOperationSchema },
    rationale: { type: 'string' },
    cochange_acknowledged: { type: 'boolean' },
    cochange_acknowledged_reason: { type: 'string' },
    regression_proof: { type: 'object', additionalProperties: true },
    repair_hypothesis: { type: 'object', additionalProperties: true },
    tournament: { type: 'object', additionalProperties: true }
  },
  additionalProperties: false
} as const

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
    status: { type: 'string', enum: ['done', 'failed', 'blocked'] },
    summary: { type: 'string' },
    findings: { type: 'array', items: { type: 'string' } },
    changed_files: { type: 'array', items: { type: 'string' } },
    patch_envelopes: { type: 'array', items: patchEnvelopeSchema },
    verification: {
      type: 'object',
      required: ['status', 'checks'],
      properties: {
        status: { type: 'string' },
        checks: { type: 'array', items: { type: 'string' } }
      },
      additionalProperties: false
    },
    rollback_notes: { type: 'array', items: { type: 'string' } },
    blockers: { type: 'array', items: { type: 'string' } },
    work_item_kind: { type: 'string' },
    regression_proof: { type: 'object', additionalProperties: true },
    repair_hypothesis: { type: 'object', additionalProperties: true },
    tournament: { type: 'object', additionalProperties: true }
  },
  additionalProperties: false
} as const
