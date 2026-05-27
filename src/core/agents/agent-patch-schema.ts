export const AGENT_PATCH_SCHEMA = 'sks.agent-patch-envelope.v1'

export type AgentPatchOperationKind = 'replace' | 'write' | 'unified_diff'

export interface AgentPatchOperation {
  op: AgentPatchOperationKind
  path: string
  search?: string
  replace?: string
  content?: string
  diff?: string
}

export interface AgentPatchEnvelope {
  schema: typeof AGENT_PATCH_SCHEMA
  agent_id: string
  session_id?: string
  lease_id?: string
  lease_proof?: {
    lease_id?: string
    owner_agent?: string
    allowed_paths?: string[]
  }
  operations: AgentPatchOperation[]
  rationale?: string
}

type AgentPatchLeaseProof = NonNullable<AgentPatchEnvelope['lease_proof']>

export function normalizeAgentPatchEnvelope(input: any): AgentPatchEnvelope {
  return {
    schema: AGENT_PATCH_SCHEMA,
    agent_id: String(input?.agent_id || input?.agentId || 'unknown-agent'),
    ...(input?.session_id ? { session_id: String(input.session_id) } : {}),
    ...(input?.lease_id ? { lease_id: String(input.lease_id) } : {}),
    ...(input?.lease_proof ? { lease_proof: normalizeLeaseProof(input.lease_proof) } : {}),
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
    if (operation.op === 'unified_diff' && typeof operation.diff !== 'string') violations.push(`unified_diff_missing:${operation.path}`)
  }
  return { ok: violations.length === 0, violations }
}

function normalizeOperation(input: any): AgentPatchOperation {
  const op = input?.op === 'write' ? 'write' : input?.op === 'unified_diff' || input?.op === 'patch' ? 'unified_diff' : 'replace'
  return {
    op,
    path: String(input?.path || ''),
    ...(input?.search === undefined ? {} : { search: String(input.search) }),
    ...(input?.replace === undefined ? {} : { replace: String(input.replace) }),
    ...(input?.content === undefined ? {} : { content: String(input.content) }),
    ...(input?.diff === undefined ? {} : { diff: String(input.diff) })
  }
}

function normalizeLeaseProof(input: any): AgentPatchLeaseProof {
  return {
    ...(input?.lease_id === undefined ? {} : { lease_id: String(input.lease_id) }),
    ...(input?.owner_agent === undefined ? {} : { owner_agent: String(input.owner_agent) }),
    ...(Array.isArray(input?.allowed_paths) ? { allowed_paths: input.allowed_paths.map(String) } : {})
  }
}
