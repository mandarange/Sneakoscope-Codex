export type NarutoWorkKind =
  | 'implementation'
  | 'code_modification'
  | 'refactor'
  | 'test_generation'
  | 'test_execution'
  | 'verification'
  | 'research'
  | 'documentation'
  | 'ux_review'
  | 'ppt_review'
  | 'image_review'
  | 'conflict_resolution'
  | 'patch_rebase'
  | 'rollback_preparation'
  | 'integration_support'
  | 'final_review_input_pack'

export type NarutoLeaseKind = 'read' | 'write'

export interface NarutoLeaseRequirement {
  path: string
  kind: NarutoLeaseKind
}

export interface NarutoWorkItemCost {
  tokens: number
  latency_ms: number
  cpu_weight: number
  memory_mb: number
  gpu_weight: number
}

export interface NarutoWorkItemAcceptance {
  requires_patch_envelope: boolean
  requires_verification: boolean
  requires_gpt_final: boolean
}

export interface NarutoWorktreePolicy {
  mode: 'git-worktree' | 'patch-envelope-only'
  required: boolean
  main_repo_root: string | null
  worktree_root: string | null
  fallback_reason: string | null
}

export interface NarutoWorkItem {
  id: string
  kind: NarutoWorkKind
  title: string
  target_paths: string[]
  readonly_paths: string[]
  write_paths: string[]
  required_role: string
  write_allowed: boolean
  verification_required: boolean
  dependencies: string[]
  can_run_in_parallel_with: string[]
  conflicts_with: string[]
  estimated_cost: NarutoWorkItemCost
  lease_requirements: NarutoLeaseRequirement[]
  acceptance: NarutoWorkItemAcceptance
  worktree?: {
    mode: NarutoWorktreePolicy['mode']
    required: boolean
    allocation_required: boolean
  }
}

export interface NarutoWorkGraph {
  schema: 'sks.naruto-work-graph.v1'
  route: '$Naruto'
  requested_clones: number
  total_work_items: number
  readonly: boolean
  write_capable: boolean
  work_items: NarutoWorkItem[]
  active_waves: NarutoWorkWave[]
  mixed_work_kinds: NarutoWorkKind[]
  write_allowed_count: number
  worktree_policy: NarutoWorktreePolicy
  blockers: string[]
  ok: boolean
}

export interface NarutoWorkWave {
  wave_id: string
  work_item_ids: string[]
  write_paths: string[]
  conflict_count: number
}

export const NARUTO_WORK_KINDS: NarutoWorkKind[] = [
  'implementation',
  'code_modification',
  'refactor',
  'test_generation',
  'test_execution',
  'verification',
  'research',
  'documentation',
  'ux_review',
  'ppt_review',
  'image_review',
  'conflict_resolution',
  'patch_rebase',
  'rollback_preparation',
  'integration_support',
  'final_review_input_pack'
]

export const NARUTO_WRITE_WORK_KINDS = new Set<NarutoWorkKind>([
  'implementation',
  'code_modification',
  'refactor',
  'test_generation',
  'documentation',
  'conflict_resolution',
  'patch_rebase',
  'rollback_preparation',
  'integration_support'
])

export function isNarutoWriteKind(kind: NarutoWorkKind): boolean {
  return NARUTO_WRITE_WORK_KINDS.has(kind)
}

export function normalizeNarutoWorkKind(value: unknown, fallback: NarutoWorkKind = 'verification'): NarutoWorkKind {
  const text = String(value || '')
  return (NARUTO_WORK_KINDS as string[]).includes(text) ? text as NarutoWorkKind : fallback
}

export function normalizeNarutoPath(value: string): string {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\/+/, '').split('/').filter((part) => part && part !== '.').join('/')
}
