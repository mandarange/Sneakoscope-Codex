import { nowIso } from '../fsx.js'

export const LOCAL_COLLABORATION_POLICY_SCHEMA = 'sks.local-collaboration-policy.v1'
export const LOCAL_COLLABORATION_FINAL_GATE_SCHEMA = 'sks.local-collaboration-final-gate.v1'
export const DEFAULT_LOCAL_COLLABORATION_MODE = 'local-parallel-gpt-final'

export const LOCAL_COLLABORATION_MODES = [
  'disabled',
  'local-draft-gpt-final',
  'local-worker-gpt-orchestrator',
  'local-parallel-gpt-final',
  'local-only-draft'
] as const

export type LocalCollaborationMode = typeof LOCAL_COLLABORATION_MODES[number]
export type GptFinalStatus = 'approved' | 'modified' | 'rejected' | 'needs_more_work'

export interface LocalCollaborationPolicy {
  schema: typeof LOCAL_COLLABORATION_POLICY_SCHEMA
  generated_at: string
  mode: LocalCollaborationMode
  default_mode: typeof DEFAULT_LOCAL_COLLABORATION_MODE
  local_llm_role: 'disabled' | 'draft_worker'
  gpt_final_required: boolean
  gpt_final_backend_must_be_remote: boolean
  local_only_draft: boolean
  final_accepted_statuses: Array<'approved' | 'modified'>
  final_patch_source_when_enabled: 'gpt_final_arbiter'
  blockers: string[]
}

export function resolveLocalCollaborationPolicy(input: { mode?: string | null; env?: NodeJS.ProcessEnv } = {}): LocalCollaborationPolicy {
  const env = input.env || process.env
  const requested = firstText(input.mode, env.SKS_LOCAL_COLLAB_MODE, DEFAULT_LOCAL_COLLABORATION_MODE)
  const mode = normalizeLocalCollaborationMode(requested)
  const invalid = mode ? [] : [`invalid_local_collaboration_mode:${requested}`]
  const resolvedMode = mode || DEFAULT_LOCAL_COLLABORATION_MODE
  return {
    schema: LOCAL_COLLABORATION_POLICY_SCHEMA,
    generated_at: nowIso(),
    mode: resolvedMode,
    default_mode: DEFAULT_LOCAL_COLLABORATION_MODE,
    local_llm_role: resolvedMode === 'disabled' ? 'disabled' : 'draft_worker',
    gpt_final_required: resolvedMode !== 'disabled' && resolvedMode !== 'local-only-draft',
    gpt_final_backend_must_be_remote: resolvedMode !== 'disabled',
    local_only_draft: resolvedMode === 'local-only-draft',
    final_accepted_statuses: ['approved', 'modified'],
    final_patch_source_when_enabled: 'gpt_final_arbiter',
    blockers: [
      ...invalid,
      ...(resolvedMode === 'local-only-draft' ? ['needs_gpt_final_review'] : [])
    ]
  }
}

export function evaluateLocalCollaborationFinalGate(input: {
  policy?: LocalCollaborationPolicy
  mode?: string | null
  localParticipated?: boolean
  gptFinalStatus?: string | null
  gptFinalAvailable?: boolean
  gptFinalBackend?: string | null
  applyPatches?: boolean
} = {}) {
  const policy = input.policy || resolveLocalCollaborationPolicy(input.mode === undefined ? {} : { mode: input.mode })
  const localParticipated = input.localParticipated !== false && policy.mode !== 'disabled'
  const status = normalizeGptFinalStatus(input.gptFinalStatus)
  const requiresGptFinal = policy.gpt_final_required && localParticipated
  const gptBackend = String(input.gptFinalBackend || '')
  const remoteBackendOk = !gptBackend || !isLocalBackendName(gptBackend)
  const blockers = [
    ...policy.blockers,
    ...(requiresGptFinal && input.gptFinalAvailable === false ? ['gpt_final_arbiter_unavailable'] : []),
    ...(requiresGptFinal && !status ? ['gpt_final_arbiter_missing'] : []),
    ...(requiresGptFinal && status && !policy.final_accepted_statuses.includes(status as 'approved' | 'modified') ? [`gpt_final_status_not_accepted:${status}`] : []),
    ...(requiresGptFinal && !remoteBackendOk ? ['gpt_final_backend_must_not_be_local_llm'] : []),
    ...(policy.local_only_draft && input.applyPatches === true ? ['local_only_draft_apply_blocked'] : [])
  ]
  const accepted = blockers.length === 0 && (!requiresGptFinal || status === 'approved' || status === 'modified')
  return {
    schema: LOCAL_COLLABORATION_FINAL_GATE_SCHEMA,
    generated_at: nowIso(),
    ok: accepted,
    mode: policy.mode,
    local_participated: localParticipated,
    gpt_final_required: requiresGptFinal,
    gpt_final_status: status,
    gpt_final_backend: gptBackend || null,
    final_status: accepted ? 'accepted' : policy.local_only_draft ? 'draft_only' : 'blocked',
    apply_allowed: accepted && policy.local_only_draft !== true,
    release_proof_allowed: accepted,
    final_patch_source: accepted && policy.mode !== 'disabled' ? policy.final_patch_source_when_enabled : 'not_applicable',
    blockers
  }
}

export function localCollaborationParticipated(results: any[] = []) {
  return results.some((result) => {
    const backend = String(result?.backend_router_report?.selected_backend || result?.backend || '').toLowerCase()
    return backend === 'ollama' || backend === 'local-llm' || backend === 'local_llm'
  })
}

export function normalizeLocalCollaborationMode(value: unknown): LocalCollaborationMode | null {
  const text = String(value ?? '').trim()
  return (LOCAL_COLLABORATION_MODES as readonly string[]).includes(text) ? text as LocalCollaborationMode : null
}

export function normalizeGptFinalStatus(value: unknown): GptFinalStatus | null {
  const text = String(value ?? '').trim()
  return text === 'approved' || text === 'modified' || text === 'rejected' || text === 'needs_more_work' ? text : null
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

function isLocalBackendName(value: string) {
  const text = value.toLowerCase()
  return text === 'ollama' || text === 'local-llm' || text === 'local_llm'
}
