import type { AgentTaskSlice } from '../agent-schema.js'
import { createAgentLease } from '../agent-lease.js'

export function planAgentLeases(slices: AgentTaskSlice[], sessions: Record<string, string> = {}, strategyOwnershipPlan: { owners?: any[] } | null = null) {
  const ownership = new Map((strategyOwnershipPlan?.owners || []).map((owner: any) => [`${String(owner.access || '')}:${normalizePath(owner.path)}`, owner]))
  const ownershipByTask = new Map((strategyOwnershipPlan?.owners || []).map((owner: any) => [`${String(owner.access || '')}:${String(owner.micro_win_id || owner.task_id || '')}`, owner]))
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
      ...slice.write_paths.map((file) => enrichStrategyLease(createAgentLease(base('write', file)), slice, ownership.get(`write:${normalizePath(file)}`) || ownershipByTask.get(`write:${slice.micro_win_id || ''}`))),
      ...slice.readonly_paths.map((file) => enrichStrategyLease(createAgentLease(base('read', file)), slice, ownership.get(`read:${normalizePath(file)}`) || ownershipByTask.get(`read:${slice.micro_win_id || ''}`)))
    ]
  })
}

function enrichStrategyLease(lease: ReturnType<typeof createAgentLease>, slice: AgentTaskSlice, owner: any) {
  if (!owner && !slice.micro_win_id) return lease
  const writePaths = Array.isArray(owner?.access === 'write' ? [owner.path] : slice.write_paths) ? (owner?.access === 'write' ? [owner.path] : slice.write_paths) : []
  return {
    ...lease,
    strategy_task_id: owner?.task_id || slice.micro_win_id || null,
    micro_win_id: owner?.micro_win_id || slice.micro_win_id || null,
    owner_agent: owner?.owner_agent || slice.owner_agent_id,
    owner_persona: owner?.owner_persona || slice.required_persona_category || slice.role || null,
    write_paths: writePaths.map(String),
    protected_path_check: owner?.protected_path_check || { ok: true, blockers: [] },
    conflict_prediction_id: owner?.conflict_prediction_id || null,
    verification_node_id: owner?.verification_node_id || null,
    rollback_node_id: owner?.rollback_node_id || null,
    strategy_artifact: 'file-ownership-plan.json'
  }
}

function normalizePath(input: string) {
  return String(input || '').replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/+$/, '') || '.'
}
