import type { AgentTaskSlice } from '../agent-schema.js'
import { createAgentLease } from '../agent-lease.js'

export function planAgentLeases(slices: AgentTaskSlice[], sessions: Record<string, string> = {}) {
  return slices.flatMap((slice) => {
    const sessionId = sessions[slice.owner_agent_id]
    const base = (kind: 'write' | 'read', file: string) => ({
      agent_id: slice.owner_agent_id,
      ...(sessionId !== undefined ? { session_id: sessionId } : {}),
      kind,
      path: file,
      domain: slice.domain
    })
    return [
      ...slice.write_paths.map((file) => createAgentLease(base('write', file))),
      ...slice.readonly_paths.map((file) => createAgentLease(base('read', file)))
    ]
  })
}
