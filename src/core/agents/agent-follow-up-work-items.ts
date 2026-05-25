import { scanAgentTextForRecursion } from './agent-recursion-guard.js'

export interface AgentFollowUpWorkItem {
  id: string
  title: string
  description: string
  required_persona_category: string
  priority: number
  dependencies: string[]
  lease_requirements: unknown[]
  max_attempts: number
  reason: string
  source_agent_session_id?: string
}

export interface AgentFollowUpValidationResult {
  accepted: AgentFollowUpWorkItem[]
  blockers: string[]
}

const FOLLOW_UP_KEYS = new Set([
  'id',
  'title',
  'description',
  'required_persona_category',
  'priority',
  'dependencies',
  'lease_requirements',
  'max_attempts',
  'reason',
  'source_agent_session_id'
])

const PROTECTED_WRITE_PATH_RE = /^(?:\.codex|\.agents|AGENTS\.md|node_modules\/sneakoscope|\.sneakoscope\/.*policy.*\.json)(?:\/|$)/
const MAIN_ROUTE_RECURSION_RE = /(?:\bsks\s+(?:team|agent|research|qa-loop|goal)\b|\$(?:Team|Goal|Research|QA-LOOP|Agent)\b|main\s+route\s+recursion)/i
const GLOBAL_SCOUT_LEDGER_RE = /global\s+scout\s+ledger/i

export function normalizeAgentFollowUpWorkItems(rawItems: unknown, input: {
  originSessionId?: string | null
} = {}): AgentFollowUpValidationResult {
  if (rawItems === undefined || rawItems === null) return { accepted: [], blockers: [] }
  if (!Array.isArray(rawItems)) return { accepted: [], blockers: ['follow_up_work_items_not_array'] }

  const accepted: AgentFollowUpWorkItem[] = []
  const blockers: string[] = []
  rawItems.forEach((raw, index) => {
    const result = normalizeAgentFollowUpWorkItem(raw, index, input.originSessionId || null)
    if (result.item) accepted.push(result.item)
    blockers.push(...result.blockers)
  })
  return { accepted, blockers }
}

function normalizeAgentFollowUpWorkItem(raw: unknown, index: number, originSessionId: string | null): {
  item: AgentFollowUpWorkItem | null
  blockers: string[]
} {
  const blockers: string[] = []
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { item: null, blockers: [`follow_up_work_item_${index + 1}_not_object`] }
  }
  const row = raw as Record<string, unknown>
  for (const key of Object.keys(row)) {
    if (!FOLLOW_UP_KEYS.has(key)) blockers.push(`follow_up_work_item_${index + 1}_additional_property:${key}`)
  }

  const id = requiredString(row.id, 'id', index, blockers)
  const title = requiredString(row.title, 'title', index, blockers)
  const description = requiredString(row.description, 'description', index, blockers)
  const requiredPersonaCategory = requiredString(row.required_persona_category, 'required_persona_category', index, blockers)
  const reason = requiredString(row.reason, 'reason', index, blockers)
  const priority = requiredInteger(row.priority, 'priority', index, blockers, 0)
  const maxAttempts = requiredInteger(row.max_attempts, 'max_attempts', index, blockers, 1)
  const dependencies = requiredStringArray(row.dependencies, 'dependencies', index, blockers)
  const leaseRequirements = requiredArray(row.lease_requirements, 'lease_requirements', index, blockers)
  const sourceAgentSessionId = typeof row.source_agent_session_id === 'string' && row.source_agent_session_id.trim()
    ? row.source_agent_session_id.trim()
    : originSessionId || undefined

  const serialized = JSON.stringify(row)
  const recursion = scanAgentTextForRecursion(serialized)
  if (!recursion.ok || MAIN_ROUTE_RECURSION_RE.test(serialized)) blockers.push(`follow_up_work_item_${index + 1}_main_route_recursion_blocked`)
  if (GLOBAL_SCOUT_LEDGER_RE.test(serialized)) blockers.push(`follow_up_work_item_${index + 1}_global_scout_ledger_blocked`)
  for (const lease of leaseRequirements) {
    const path = leasePath(lease)
    if (path && PROTECTED_WRITE_PATH_RE.test(path)) blockers.push(`follow_up_work_item_${index + 1}_protected_core_target:${path}`)
  }

  if (blockers.length) return { item: null, blockers }
  return {
    item: {
      id,
      title,
      description,
      required_persona_category: requiredPersonaCategory,
      priority,
      dependencies,
      lease_requirements: leaseRequirements,
      max_attempts: maxAttempts,
      reason,
      ...(sourceAgentSessionId ? { source_agent_session_id: sourceAgentSessionId } : {})
    },
    blockers: []
  }
}

function requiredString(value: unknown, field: string, index: number, blockers: string[]) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) blockers.push(`follow_up_work_item_${index + 1}_missing_${field}`)
  return text
}

function requiredInteger(value: unknown, field: string, index: number, blockers: string[], min: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || Math.floor(parsed) !== parsed || parsed < min) blockers.push(`follow_up_work_item_${index + 1}_invalid_${field}`)
  return Math.max(min, Number.isFinite(parsed) ? Math.floor(parsed) : min)
}

function requiredArray(value: unknown, field: string, index: number, blockers: string[]) {
  if (!Array.isArray(value)) {
    blockers.push(`follow_up_work_item_${index + 1}_missing_${field}`)
    return []
  }
  return value
}

function requiredStringArray(value: unknown, field: string, index: number, blockers: string[]) {
  const rows = requiredArray(value, field, index, blockers)
  const out = rows.map((entry) => String(entry || '')).filter(Boolean)
  if (out.length !== rows.length) blockers.push(`follow_up_work_item_${index + 1}_invalid_${field}`)
  return out
}

function leasePath(lease: unknown) {
  if (!lease || typeof lease !== 'object') return ''
  const row = lease as Record<string, unknown>
  return String(row.path || row.file || row.target_path || '').replace(/\\/g, '/').replace(/^\.?\//, '')
}
