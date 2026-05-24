import { validateJsonSchemaRecursive } from '../json-schema-validator.js'

export const AGENT_RESULT_RUNTIME_SCHEMA = {
  type: 'object',
  required: [
    'schema',
    'mission_id',
    'agent_id',
    'session_id',
    'persona_id',
    'task_slice_id',
    'status',
    'backend',
    'summary',
    'findings',
    'proposed_changes',
    'changed_files',
    'lease_compliance',
    'recursion_guard',
    'verification',
    'blockers',
    'confidence',
    'handoff_notes',
    'artifacts',
    'unverified',
    'writes'
  ],
  properties: {
    schema: { const: 'sks.agent-result.v1' },
    mission_id: { type: 'string' },
    agent_id: { type: 'string', minLength: 1 },
    session_id: { type: 'string', minLength: 1 },
    persona_id: { type: 'string' },
    task_slice_id: { type: 'string' },
    status: { enum: ['done', 'blocked', 'failed'] },
    backend: { enum: ['fake', 'process', 'codex-exec', 'tmux'] },
    summary: { type: 'string' },
    findings: { type: 'array', items: { type: 'string' } },
    proposed_changes: { type: 'array', items: { type: 'string' } },
    changed_files: { type: 'array', items: { type: 'string' } },
    lease_compliance: {
      type: 'object',
      required: ['ok', 'violations'],
      properties: {
        ok: { type: 'boolean' },
        violations: { type: 'array', items: { type: 'string' } }
      },
      additionalProperties: false
    },
    recursion_guard: {
      type: 'object',
      required: ['ok', 'violations'],
      properties: {
        ok: { type: 'boolean' },
        violations: { type: 'array', items: { type: 'string' } }
      },
      additionalProperties: false
    },
    verification: {
      type: 'object',
      required: ['status', 'checks'],
      properties: {
        status: { type: 'string' },
        checks: { type: 'array', items: { type: 'string' } }
      },
      additionalProperties: false
    },
    blockers: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'string' },
    handoff_notes: { type: 'string' },
    artifacts: { type: 'array', items: { type: 'string' } },
    unverified: { type: 'array', items: { type: 'string' } },
    writes: { type: 'array', items: { type: 'string' } }
  },
  additionalProperties: false
} as const

export function validateAgentResultSchema(result: unknown) {
  const validation = validateJsonSchemaRecursive(result, AGENT_RESULT_RUNTIME_SCHEMA as any)
  return {
    schema: 'sks.agent-output-schema-validation.v1',
    ok: validation.ok,
    issues: validation.issues
  }
}

