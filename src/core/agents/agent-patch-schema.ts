export const AGENT_PATCH_SCHEMA = 'sks.agent-patch-envelope.v1'

export type AgentPatchOperationKind = 'replace' | 'write'

export interface AgentPatchOperation {
  op: AgentPatchOperationKind
  path: string
  search?: string
  replace?: string
  content?: string
}

export interface AgentPatchEnvelope {
  schema: typeof AGENT_PATCH_SCHEMA
  agent_id: string
  session_id?: string
  lease_id?: string
  operations: AgentPatchOperation[]
  rationale?: string
}

export function normalizeAgentPatchEnvelope(input: any): AgentPatchEnvelope {
  return {
    schema: AGENT_PATCH_SCHEMA,
    agent_id: String(input?.agent_id || input?.agentId || 'unknown-agent'),
    ...(input?.session_id ? { session_id: String(input.session_id) } : {}),
    ...(input?.lease_id ? { lease_id: String(input.lease_id) } : {}),
    ...(input?.rationale ? { rationale: String(input.rationale) } : {}),
    operations: Array.isArray(input?.operations) ? input.operations.map(normalizeOperation) : []
  }
}

export function validateAgentPatchEnvelope(envelope: AgentPatchEnvelope): { ok: boolean; violations: string[] } {
  const violations: string[] = []
  if (envelope.schema !== AGENT_PATCH_SCHEMA) violations.push('schema_mismatch')
  if (!envelope.agent_id) violations.push('agent_id_missing')
  if (!envelope.operations.length) violations.push('operations_missing')
  for (const operation of envelope.operations) {
    if (!operation.path || operation.path.includes('\0') || operation.path.startsWith('/') || operation.path.split(/[\\/]/).includes('..')) {
      violations.push(`invalid_path:${operation.path || 'missing'}`)
    }
    if (operation.op === 'replace' && typeof operation.search !== 'string') violations.push(`replace_search_missing:${operation.path}`)
    if (operation.op === 'write' && typeof operation.content !== 'string') violations.push(`write_content_missing:${operation.path}`)
  }
  return { ok: violations.length === 0, violations }
}

function normalizeOperation(input: any): AgentPatchOperation {
  const op = input?.op === 'write' ? 'write' : 'replace'
  return {
    op,
    path: String(input?.path || ''),
    ...(input?.search === undefined ? {} : { search: String(input.search) }),
    ...(input?.replace === undefined ? {} : { replace: String(input.replace) }),
    ...(input?.content === undefined ? {} : { content: String(input.content) })
  }
}
