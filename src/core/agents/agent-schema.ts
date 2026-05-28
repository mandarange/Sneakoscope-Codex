export const AGENT_KERNEL_SCHEMA = 'sks.native-agent-kernel.v1'
export const AGENT_RESULT_SCHEMA = 'sks.agent-result.v1'
export const AGENT_LEDGER_EVENT_SCHEMA = 'sks.agent-ledger-event.v1'
export const AGENT_PROOF_EVIDENCE_SCHEMA = 'sks.agent-proof-evidence.v1'
export const AGENT_WORKER_PIPELINE = 'AGENT_WORKER_PIPELINE'
export const AGENT_ORCHESTRATOR_PIPELINE = 'AGENT_ORCHESTRATOR_PIPELINE'
export const DEFAULT_AGENT_COUNT = 5
export const AGENT_COUNT = DEFAULT_AGENT_COUNT
export const AGENT_INTAKE_STAGE_ID = 'native_agent_intake'
export const MAX_AGENT_COUNT = 20
export const DEFAULT_AGENT_CONCURRENCY = 5
export const AGENT_BACKENDS = ['fake', 'process', 'codex-exec', 'tmux'] as const

export type AgentBackend = typeof AGENT_BACKENDS[number]
export type AgentStatus = 'pending' | 'running' | 'closed' | 'blocked' | 'failed'
export type AgentRole = 'architect' | 'implementer' | 'verifier' | 'safety' | 'integrator' | 'research' | 'documentation' | 'schema' | 'release' | 'ux' | 'db'

export type { AgentFollowUpWorkItem } from './agent-follow-up-work-items.js'
export type { AgentPatchEnvelope } from './agent-patch-schema.js'

export interface AgentPersona {
  id: string
  stable_id: string
  role: AgentRole
  temperament: string
  risk_focus: string
  allowed_tools: string[]
  denied_tools: string[]
  read_only: boolean
  write_policy: string
  output_expectations: string[]
  output_schema_reminder: string
  central_ledger_communication_rule: string
  recursion_ban: string
  expected_artifacts: string[]
  lease_policy: string
  communication_style: string
  completion_criteria: string[]
  failure_criteria: string[]
  handoff_rules: string[]
  confidence_calibration: string
  verification_plan: string[]
  wrongness_triggers: string[]
  mock_behavior: string
  real_behavior: string
  docs_example: string
  prompt: string
}

export interface AgentRosterEntry {
  id: string
  session_id: string
  persona_id: string
  role: AgentRole
  index: number
  write_policy: string
  status: AgentStatus
  reasoning_effort?: 'low' | 'medium' | 'high' | 'xhigh'
  model_reasoning_effort?: 'low' | 'medium' | 'high' | 'xhigh'
  reasoning_profile?: string
  service_tier?: 'fast'
  reasoning_reason?: string
  dynamic_effort_policy?: {
    escalation_triggers: string[]
    downshift_triggers: string[]
  }
}

export interface AgentRunOptions {
  root?: string
  missionId?: string | null
  prompt?: string
  route?: string
  agents?: number
  concurrency?: number
  targetActiveSlots?: number
  desiredWorkItemCount?: number
  minimumWorkItems?: number
  maxQueueExpansion?: number
  routeCommand?: string
  routeBlackboxKind?: string
  refillDelayMs?: number
  roster?: unknown
  backend?: AgentBackend | string
  json?: boolean
  mock?: boolean
  readonly?: boolean
  real?: boolean
  profile?: string | null
  workspaceWrite?: boolean
  writeMode?: 'proof-safe' | 'parallel' | 'serial' | 'off'
  applyPatches?: boolean
  dryRunPatches?: boolean
  maxWriteAgents?: number
}

export interface AgentTaskSlice {
  id: string
  owner_agent_id: string
  role: AgentRole | string
  domain: string
  title?: string
  dependencies?: string[]
  priority?: number
  required_persona_category?: string
  lease_requirements?: unknown[]
  generated_by?: string
  route_domain?: string
  work_item_kind?: string
  max_attempts?: number
  target_paths: string[]
  readonly_paths: string[]
  write_paths: string[]
  description: string
  strategy_refs?: Record<string, unknown> | null
  micro_win_id?: string | null
  dopamine_weight?: number
  appshot_required?: boolean
}

export interface AgentLease {
  id: string
  agent_id: string
  session_id?: string
  kind: 'write' | 'read'
  path: string
  domain?: string
  status: 'active' | 'released' | 'conflicted'
  strategy_task_id?: string
  micro_win_id?: string
  owner_agent?: string
  owner_persona?: string
  write_paths?: string[]
  protected_path_check?: { ok: boolean; blockers: string[] }
  conflict_prediction_id?: string | null
  verification_node_id?: string | null
  rollback_node_id?: string | null
  strategy_artifact?: string
}

export interface AgentRunnerResult {
  schema: typeof AGENT_RESULT_SCHEMA
  mission_id: string
  agent_id: string
  session_id: string
  persona_id: string
  task_slice_id: string
  status: 'done' | 'blocked' | 'failed'
  backend: AgentBackend
  summary: string
  findings: string[]
  proposed_changes: string[]
  changed_files: string[]
  lease_compliance: { ok: boolean; violations: string[] }
  artifacts: string[]
  blockers: string[]
  confidence: string
  handoff_notes: string
  unverified: string[]
  writes: string[]
  patch_envelopes?: import('./agent-patch-schema.js').AgentPatchEnvelope[]
  patch_queue_refs?: string[]
  applied_patch_refs?: string[]
  rollback_refs?: string[]
  source_intelligence_refs?: Record<string, unknown> | null
  goal_mode_ref?: Record<string, unknown> | null
  follow_up_work_items?: import('./agent-follow-up-work-items.js').AgentFollowUpWorkItem[]
  recursion_guard: { ok: boolean; violations: string[] }
  verification: { status: string; checks: string[] }
}

export function normalizeAgentBackend(input: unknown): AgentBackend {
  const value = String(input || 'fake')
  return (AGENT_BACKENDS as readonly string[]).includes(value) ? value as AgentBackend : 'fake'
}

export function agentSessionId(agentId: string, index = 1): string {
  return agentId + '-session-' + String(index).padStart(2, '0')
}
