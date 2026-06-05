import type { AgentRole } from '../agents/agent-schema.js'
import type { NarutoWorkItem, NarutoWorkKind } from './naruto-work-item.js'

export type NarutoWorkerRole =
  | 'implementer'
  | 'modifier'
  | 'test_writer'
  | 'verifier'
  | 'researcher'
  | 'conflict_resolver'
  | 'rollback_planner'
  | 'integrator'
  | 'gpt_final_arbiter'

export interface NarutoRoleDistributionEntry {
  role: NarutoWorkerRole
  count: number
  write_allowed: boolean
}

export interface NarutoRoleDistribution {
  schema: 'sks.naruto-role-distribution.v1'
  readonly: boolean
  total_workers: number
  implementation_like_workers: number
  implementation_like_ratio: number
  verifier_only: boolean
  entries: NarutoRoleDistributionEntry[]
  work_item_roles: Array<{ work_item_id: string; kind: NarutoWorkKind; role: NarutoWorkerRole; write_allowed: boolean }>
  ok: boolean
  blockers: string[]
}

export const NARUTO_WRITE_ROLES = new Set<NarutoWorkerRole>([
  'implementer',
  'modifier',
  'test_writer',
  'conflict_resolver',
  'rollback_planner',
  'integrator'
])

export const NARUTO_IMPLEMENTATION_LIKE_ROLES = new Set<NarutoWorkerRole>([
  'implementer',
  'modifier',
  'test_writer',
  'conflict_resolver'
])

export function narutoRoleAllowsWrite(role: NarutoWorkerRole): boolean {
  return NARUTO_WRITE_ROLES.has(role)
}

export function mapWorkKindToNarutoRole(kind: NarutoWorkKind): NarutoWorkerRole {
  switch (kind) {
    case 'implementation':
      return 'implementer'
    case 'code_modification':
    case 'refactor':
    case 'patch_rebase':
      return 'modifier'
    case 'test_generation':
      return 'test_writer'
    case 'test_execution':
    case 'verification':
    case 'ux_review':
    case 'ppt_review':
    case 'image_review':
      return 'verifier'
    case 'research':
      return 'researcher'
    case 'documentation':
      return 'modifier'
    case 'conflict_resolution':
      return 'conflict_resolver'
    case 'rollback_preparation':
      return 'rollback_planner'
    case 'integration_support':
      return 'integrator'
    case 'final_review_input_pack':
      return 'gpt_final_arbiter'
  }
}

export function mapNarutoRoleToAgentRole(role: NarutoWorkerRole): AgentRole {
  switch (role) {
    case 'implementer':
    case 'modifier':
    case 'test_writer':
      return 'implementer'
    case 'researcher':
      return 'research'
    case 'conflict_resolver':
    case 'rollback_planner':
    case 'integrator':
    case 'gpt_final_arbiter':
      return 'integrator'
    case 'verifier':
      return 'verifier'
  }
}

export function buildNarutoRoleDistribution(workItems: NarutoWorkItem[], opts: { readonly?: boolean } = {}): NarutoRoleDistribution {
  const readonly = opts.readonly === true
  const counts = new Map<NarutoWorkerRole, number>()
  const workItemRoles = workItems.map((item) => {
    const role = mapWorkKindToNarutoRole(item.kind)
    counts.set(role, (counts.get(role) || 0) + 1)
    return {
      work_item_id: item.id,
      kind: item.kind,
      role,
      write_allowed: item.write_allowed && narutoRoleAllowsWrite(role)
    }
  })
  const entries = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([role, count]) => ({
    role,
    count,
    write_allowed: narutoRoleAllowsWrite(role)
  }))
  const implementationLikeWorkers = workItemRoles.filter((row) => NARUTO_IMPLEMENTATION_LIKE_ROLES.has(row.role)).length
  const totalWorkers = workItems.length
  const implementationLikeRatio = totalWorkers ? implementationLikeWorkers / totalWorkers : 0
  const verifierOnly = totalWorkers > 0 && workItemRoles.every((row) => row.role === 'verifier')
  const writeAllowedCount = workItemRoles.filter((row) => row.write_allowed).length
  const blockers = [
    ...(totalWorkers === 0 ? ['naruto_role_distribution_empty'] : []),
    ...(!readonly && verifierOnly ? ['naruto_default_must_not_be_verifier_only'] : []),
    ...(!readonly && implementationLikeRatio < 0.4 ? ['naruto_write_capable_route_requires_40_percent_implementation_like_roles'] : []),
    ...(!readonly && writeAllowedCount === 0 ? ['naruto_write_capable_route_requires_write_roles'] : [])
  ]
  return {
    schema: 'sks.naruto-role-distribution.v1',
    readonly,
    total_workers: totalWorkers,
    implementation_like_workers: implementationLikeWorkers,
    implementation_like_ratio: Math.round(implementationLikeRatio * 1000) / 1000,
    verifier_only: verifierOnly,
    entries,
    work_item_roles: workItemRoles,
    ok: blockers.length === 0,
    blockers
  }
}

