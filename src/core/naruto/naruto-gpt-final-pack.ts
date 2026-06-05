import type { AgentPatchEnvelope } from '../agents/agent-patch-schema.js'
import type { GitWorktreeDiff } from '../git/git-worktree-diff.js'
import type { NarutoRoleDistribution } from './naruto-role-policy.js'
import type { NarutoWorkGraph, NarutoWorktreePolicy } from './naruto-work-item.js'

export interface NarutoGptFinalPack {
  schema: 'sks.naruto-gpt-final-pack.v1'
  mission_id: string
  route: '$Naruto'
  work_graph_summary: {
    total_work_items: number
    mixed_work_kinds: string[]
    write_allowed_count: number
  }
  role_distribution: NarutoRoleDistribution
  changed_files: string[]
  worktree_policy: NarutoWorktreePolicy
  worktree_diffs: unknown[]
  patch_envelopes: unknown[]
  verification_results: unknown[]
  failed_shards: unknown[]
  conflict_map: unknown[]
  rollback_plan: unknown
  side_effect_report: unknown
  local_llm_metrics: unknown
  representative_logs: string[]
  bounded: true
  secrets_redacted: true
}

export function buildNarutoGptFinalPack(input: {
  missionId: string
  graph: NarutoWorkGraph
  roleDistribution: NarutoRoleDistribution
  changedFiles?: string[]
  worktreePolicy?: NarutoWorktreePolicy
  worktreeDiffs?: GitWorktreeDiff[] | unknown[]
  patchEnvelopes?: AgentPatchEnvelope[] | unknown[]
  verificationResults?: unknown[]
  failedShards?: unknown[]
  conflictMap?: unknown[]
  rollbackPlan?: unknown
  sideEffectReport?: unknown
  localLlmMetrics?: unknown
  logs?: string[]
  maxPatchEnvelopes?: number
  maxLogs?: number
}): NarutoGptFinalPack {
  const maxPatchEnvelopes = Math.max(1, Math.floor(Number(input.maxPatchEnvelopes || 100)))
  const maxLogs = Math.max(1, Math.floor(Number(input.maxLogs || 12)))
  return {
    schema: 'sks.naruto-gpt-final-pack.v1',
    mission_id: input.missionId,
    route: '$Naruto',
    work_graph_summary: {
      total_work_items: input.graph.total_work_items,
      mixed_work_kinds: input.graph.mixed_work_kinds,
      write_allowed_count: input.graph.write_allowed_count
    },
    role_distribution: input.roleDistribution,
    changed_files: [...new Set((input.changedFiles || []).map(String))],
    worktree_policy: input.worktreePolicy || input.graph.worktree_policy,
    worktree_diffs: (input.worktreeDiffs || []).slice(0, maxPatchEnvelopes).map(redactSecrets),
    patch_envelopes: (input.patchEnvelopes || []).slice(0, maxPatchEnvelopes).map(redactSecrets),
    verification_results: (input.verificationResults || []).slice(0, 200).map(redactSecrets),
    failed_shards: (input.failedShards || []).slice(0, 100).map(redactSecrets),
    conflict_map: (input.conflictMap || []).slice(0, 100).map(redactSecrets),
    rollback_plan: redactSecrets(input.rollbackPlan || { status: 'not_required' }),
    side_effect_report: redactSecrets(input.sideEffectReport || { status: 'not_recorded' }),
    local_llm_metrics: redactSecrets(input.localLlmMetrics || { participated: false }),
    representative_logs: (input.logs || []).slice(0, maxLogs).map((log) => redactSecretText(log).slice(-4000)),
    bounded: true,
    secrets_redacted: true
  }
}

export function redactSecrets(value: unknown): unknown {
  if (typeof value === 'string') return redactSecretText(value)
  if (Array.isArray(value)) return value.map(redactSecrets)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      if (/token|secret|password|api[_-]?key|authorization/i.test(key)) out[key] = '[REDACTED]'
      else out[key] = redactSecrets(item)
    }
    return out
  }
  return value
}

function redactSecretText(value: string): string {
  return String(value)
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, 'sk-[REDACTED]')
    .replace(/(api[_-]?key|authorization|token|password)\s*[:=]\s*\S+/gi, '$1=[REDACTED]')
}
