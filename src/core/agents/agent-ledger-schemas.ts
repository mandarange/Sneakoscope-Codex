import { validateJsonSchemaRecursive } from '../json-schema-validator.js'

const stringArray = { type: 'array', items: { type: 'string' } } as const
const objectPayload = { type: 'object' } as const

export const AGENT_CENTRAL_LEDGER_RUNTIME_SCHEMAS = {
  'sks.agent-event.v1': {
    type: 'object',
    required: ['schema', 'sequence', 'timestamp', 'agent_id', 'session_id', 'event_type', 'previous_hash', 'current_hash', 'payload'],
    properties: {
      schema: { enum: ['sks.agent-event.v1', 'sks.agent-ledger-event.v1'] },
      sequence: { type: 'integer', minimum: 1 },
      timestamp: { type: 'string', minLength: 1 },
      agent_id: { type: 'string', minLength: 1 },
      session_id: { type: 'string', minLength: 1 },
      event_type: { type: 'string', minLength: 1 },
      previous_hash: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      current_hash: { type: 'string', minLength: 1 },
      payload: objectPayload
    },
    additionalProperties: false
  },
  'sks.agent-message.v1': {
    type: 'object',
    required: ['schema', 'from', 'session_id', 'to', 'type', 'body'],
    properties: {
      schema: { const: 'sks.agent-message.v1' },
      from: { type: 'string', minLength: 1 },
      session_id: { type: 'string', minLength: 1 },
      to: { type: 'string', minLength: 1 },
      type: { type: 'string', minLength: 1 },
      body: { type: 'string' }
    },
    additionalProperties: false
  },
  'sks.agent-task-board.v1': {
    type: 'object',
    required: ['schema', 'mission_id', 'route', 'prompt', 'slices'],
    properties: {
      schema: { const: 'sks.agent-task-board.v1' },
      mission_id: { type: 'string', minLength: 1 },
      route: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      prompt: { type: 'string' },
      slices: { type: 'array', items: objectPayload }
    },
    additionalProperties: false
  },
  'sks.agent-session-record.v1': {
    type: 'object',
    required: ['schema', 'agent_id', 'session_id', 'status'],
    properties: {
      schema: { const: 'sks.agent-session-record.v1' },
      agent_id: { type: 'string', minLength: 1 },
      session_id: { type: 'string', minLength: 1 },
      status: { type: 'string', minLength: 1 },
      opened_at: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      heartbeat_at: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      closed_at: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      kill_reason: { type: 'string' }
    },
    additionalProperties: false
  },
  'sks.agent-lease-ledger.v1': {
    type: 'object',
    required: ['schema', 'leases'],
    properties: {
      schema: { const: 'sks.agent-leases.v1' },
      leases: { type: 'array', items: objectPayload },
      no_overlap_ok: { type: 'boolean' }
    },
    additionalProperties: false
  },
  'sks.agent-conflict-graph.v1': {
    type: 'object',
    required: ['schema', 'ok', 'nodes', 'conflicts', 'blockers'],
    properties: {
      schema: { const: 'sks.agent-conflict-graph.v1' },
      ok: { type: 'boolean' },
      nodes: { type: 'array', items: objectPayload },
      conflicts: { type: 'array', items: objectPayload },
      blockers: stringArray
    },
    additionalProperties: false
  },
  'sks.agent-consensus.v1': {
    type: 'object',
    required: ['schema', 'ok', 'status', 'agreements'],
    properties: {
      schema: { const: 'sks.agent-consensus.v1' },
      ok: { type: 'boolean' },
      status: { type: 'string', minLength: 1 },
      agent_count: { type: 'integer', minimum: 0 },
      agreements: { type: 'array', items: objectPayload },
      blockers: stringArray
    },
    additionalProperties: false
  },
  'sks.agent-proof-evidence.v1': {
    type: 'object',
    required: ['schema', 'ok', 'status', 'mission_id'],
    properties: {
      schema: { const: 'sks.agent-proof-evidence.v1' },
      ok: { type: 'boolean' },
      status: { type: 'string', minLength: 1 },
      mission_id: { type: 'string' },
      route: { type: 'string' },
      blockers: stringArray
    },
    additionalProperties: false
  },
  'sks.agent-cleanup.v1': {
    type: 'object',
    required: ['schema', 'generated_at', 'total_sessions', 'all_sessions_closed'],
    properties: {
      schema: { const: 'sks.agent-cleanup.v1' },
      generated_at: { type: 'string', minLength: 1 },
      launched_count: { type: 'integer', minimum: 0 },
      closed_session_count: { type: 'integer', minimum: 0 },
      terminal_session_count: { type: 'integer', minimum: 0 },
      total_sessions: { type: 'integer', minimum: 0 },
      all_sessions_closed: { type: 'boolean' },
      all_sessions_terminal: { type: 'boolean' },
      killed_sessions: stringArray,
      timed_out_sessions: stringArray
    },
    additionalProperties: false
  },
  'sks.agent-non-recursive-pipeline.v1': {
    type: 'object',
    required: ['schema', 'ok'],
    properties: {
      schema: { enum: ['sks.agent-non-recursive-pipeline.v1', 'sks.non-recursive-pipeline-report.v1'] },
      ok: { type: 'boolean' },
      status: { type: 'string' },
      issues: { type: 'array', items: objectPayload }
    },
    additionalProperties: false
  }
} as const

export function agentCentralLedgerSchemaEntries() {
  return Object.entries(AGENT_CENTRAL_LEDGER_RUNTIME_SCHEMAS)
}

export function validateAgentCentralLedgerSchema(schemaId: string, value: unknown) {
  const schema = (AGENT_CENTRAL_LEDGER_RUNTIME_SCHEMAS as any)[schemaId]
  if (!schema) return { ok: false, issues: [`unknown_agent_schema:${schemaId}`] }
  return validateJsonSchemaRecursive(value, schema)
}
