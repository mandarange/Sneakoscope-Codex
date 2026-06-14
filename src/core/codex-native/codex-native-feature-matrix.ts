export type CodexNativeFeatureStatus = 'available' | 'unavailable' | 'unknown' | 'blocked' | 'fallback'

export type CodexNativeFeatureSource =
  | 'actual-probe'
  | 'codex-doctor'
  | 'plugin-inventory'
  | 'config'
  | 'fixture'
  | 'fallback'
  | 'not-applicable'

export interface CodexNativeFeatureState {
  ok: boolean
  status: CodexNativeFeatureStatus
  source: CodexNativeFeatureSource
  artifact_path: string | null
  evidence: string[]
  blockers: string[]
  warnings: string[]
}

export interface CodexNativeInvocationDefaults {
  loop_worker_role_strategy: 'agent_type' | 'message-role'
  qa_visual_review_strategy: 'app-handoff' | 'headless-artifact' | 'blocked'
  research_source_strategy: 'mcp-plugin-candidates' | 'web-sources' | 'local-files'
  image_followup_strategy: 'model-visible-path' | 'artifact-path' | 'blocked'
  hook_evidence_policy: 'approved-only' | 'unknown-do-not-count' | 'not-installed'
  skill_bridge_strategy: 'sks-managed-skills' | 'cli-only'
}

export interface CodexNativeFeatureMatrix {
  schema: 'sks.codex-native-feature-matrix.v1'
  generated_at: string
  ok: boolean
  codex_cli: {
    available: boolean
    version: string | null
    bin: string | null
  }
  features: {
    plugin_json: CodexNativeFeatureState
    plugin_marketplace: CodexNativeFeatureState
    hook_approval: CodexNativeFeatureState
    skill_picker: CodexNativeFeatureState
    skill_sync: CodexNativeFeatureState
    agent_roles: CodexNativeFeatureState
    agent_type: CodexNativeFeatureState
    mcp_inventory: CodexNativeFeatureState
    app_handoff: CodexNativeFeatureState
    image_path_exposure: CodexNativeFeatureState
    code_mode_web_search: CodexNativeFeatureState
    slash_command_bridge: CodexNativeFeatureState
    project_memory: CodexNativeFeatureState
  }
  probes: Record<string, unknown>
  invocation_defaults: CodexNativeInvocationDefaults
  blockers: string[]
  warnings: string[]
}

export function codexNativeFeatureState(input: {
  ok: boolean
  source: CodexNativeFeatureSource
  artifact_path?: string | null
  evidence?: string[]
  blockers?: string[]
  warnings?: string[]
  unavailableStatus?: Extract<CodexNativeFeatureStatus, 'unavailable' | 'unknown' | 'blocked' | 'fallback'>
}): CodexNativeFeatureState {
  const blockers = uniq(input.blockers || [])
  return {
    ok: input.ok && blockers.length === 0,
    status: input.ok && blockers.length === 0 ? 'available' : input.unavailableStatus || (blockers.length ? 'blocked' : 'unavailable'),
    source: input.source,
    artifact_path: input.artifact_path ?? null,
    evidence: uniq(input.evidence || []),
    blockers,
    warnings: uniq(input.warnings || [])
  }
}

export function computeCodexNativeInvocationDefaults(matrix: Pick<CodexNativeFeatureMatrix, 'features'>): CodexNativeInvocationDefaults {
  const features = matrix.features
  const hookStatus = features.hook_approval.status
  return {
    loop_worker_role_strategy: features.agent_type.ok ? 'agent_type' : 'message-role',
    qa_visual_review_strategy: features.app_handoff.ok ? 'app-handoff' : 'headless-artifact',
    research_source_strategy: features.mcp_inventory.ok ? 'mcp-plugin-candidates' : features.code_mode_web_search.ok ? 'web-sources' : 'local-files',
    image_followup_strategy: features.image_path_exposure.ok ? 'model-visible-path' : 'artifact-path',
    hook_evidence_policy: hookStatus === 'available' ? 'approved-only' : hookStatus === 'unavailable' ? 'not-installed' : 'unknown-do-not-count',
    skill_bridge_strategy: features.skill_sync.ok || features.skill_picker.ok ? 'sks-managed-skills' : 'cli-only'
  }
}

export function matrixFeatureOk(matrix: CodexNativeFeatureMatrix, key: keyof CodexNativeFeatureMatrix['features']): boolean {
  return matrix.features[key].ok
}

export function uniq(values: string[]): string[] {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
}
