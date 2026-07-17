import { OFFICIAL_SUBAGENT_EXECUTION_STAGE_ID } from './agent-schema.js'
import { classifyTaskProfile, isTaskProfile, type TaskProfile } from '../runtime/task-profile.js'
import { routePrompt, routeRequiresSubagents } from '../routes.js'
import {
  DEFAULT_NARUTO_MAX_THREADS,
  DEFAULT_NARUTO_REQUESTED_SUBAGENTS,
  resolveSubagentThreadBudget
} from '../subagents/thread-budget.js'

const OFFICIAL_SUBAGENT_ROUTE_KEYS = new Set([
  'naruto', '$naruto',
  'work', '$work'
])

const EXPLICIT_SUBAGENT_RE = /\$(Naruto|Work)\b/i
const PARALLELIZABLE_RE = /\b(parallel|subagents?|fan out|one agent per|independent|disjoint|multiple files|all files)\b|병렬|하위\s*에이전트|서브\s*에이전트|독립|분리된|여러\s*파일|모든\s*파일|분담/i

function routeKey(route: any): string {
  return String(route?.id || route?.command || route?.name || route || '').trim().toLowerCase()
}

export function routeRequiresOfficialSubagents(route: any, input: any = {}): boolean {
  const options = normalizeOptions(input)
  if (options.noAgents === true || options.agents === false) return false
  if (options.force === true || options.forceAgents === true) return true

  const task = String(options.task || '')
  const officialRouteWasImplicit = Boolean(
    route
    && typeof route === 'object'
    && !Array.isArray(route)
    && route.explicit_invocation === false
  )
  if ((OFFICIAL_SUBAGENT_ROUTE_KEYS.has(routeKey(route)) && !officialRouteWasImplicit) || EXPLICIT_SUBAGENT_RE.test(task)) return true
  if (positiveNumber(options.requestedSubagents) || positiveNumber(options.agents)) return true

  const profile = taskProfile(options.taskProfile, task)
  const resolvedRoute = typeof route === 'string' ? routePrompt(route) : route
  return routeRequiresSubagents(resolvedRoute, task, profile)
}

export function normalizeOfficialSubagentPolicy(route: any, task: any = '', input: any = {}) {
  const options = normalizeOptions(input)
  const profile = taskProfile(options.taskProfile, String(task || ''))
  const required = typeof options.required === 'boolean'
    ? options.required
    : routeRequiresOfficialSubagents(route, { ...options, task, taskProfile: profile })
  const requested = firstPositiveNumber(
    options.requestedSubagents,
    options.agents,
    options.independentSliceCount
  )
  const budget = resolveSubagentThreadBudget({
    ...(requested === null ? {} : { requested }),
    ...(positiveNumber(options.maxThreads) ? { configuredMaxThreads: Number(options.maxThreads) } : {}),
    ...(positiveNumber(options.independentSliceCount) ? { independentSliceCount: Number(options.independentSliceCount) } : {}),
    ...capacityOptions(options)
  })
  const requestedSubagents = required ? budget.requestedSubagents : 0

  return {
    schema: 'sks.official-subagent-policy.v1',
    required,
    subagents_required: required,
    task_profile: profile,
    stage_id: OFFICIAL_SUBAGENT_EXECUTION_STAGE_ID,
    workflow: 'official_codex_subagent',
    requested_subagents: requestedSubagents,
    max_threads: budget.maxThreads,
    max_depth: budget.maxDepth,
    first_wave: required ? budget.firstWave : 0,
    wave_count: required ? budget.waveCount : 0,
    capacity_controller: budget.capacity,
    backend: 'official-codex-subagent',
    reason: policyReason(route, task, profile, required),
    outputs: ['subagent-plan.json', 'subagent-events.jsonl', 'subagent-parent-summary.json', 'subagent-evidence.json']
  }
}

export function officialSubagentPipelineStage(policy: any = {}) {
  const required = policy.required !== false
  const requestedSubagents = required
    ? Math.max(1, Math.floor(Number(policy.requested_subagents || DEFAULT_NARUTO_REQUESTED_SUBAGENTS)))
    : 0
  const maxThreads = required
    ? Math.max(1, Math.floor(Number(policy.max_threads || DEFAULT_NARUTO_MAX_THREADS)))
    : 0
  const firstWave = required
    ? Math.max(0, Math.floor(Number(policy.first_wave ?? Math.min(requestedSubagents, maxThreads))))
    : 0

  return {
    id: OFFICIAL_SUBAGENT_EXECUTION_STAGE_ID,
    goal: 'Run a Codex official subagent workflow with disjoint ownership and correlated event evidence.',
    workflow: 'official_codex_subagent',
    requested_subagents: requestedSubagents,
    max_parallel_agent_threads: firstWave,
    max_threads: maxThreads,
    max_depth: 1,
    capacity_controller: policy.capacity_controller || null,
    backend: 'official-codex-subagent',
    read_only: false,
    write_policy: 'bounded workspace-write with disjoint path leases; parent-owned integration',
    outputs: policy.outputs || ['subagent-plan.json', 'subagent-events.jsonl', 'subagent-parent-summary.json', 'subagent-evidence.json']
  }
}

function capacityOptions(options: Record<string, any>) {
  return Object.fromEntries([
    ['readyDagWidth', options.readyDagWidth],
    ['disjointOwnershipCount', options.disjointOwnershipCount],
    ['verifierCapacity', options.verifierCapacity],
    ['toolConcurrency', options.toolConcurrency],
    ['activeThreadCount', options.activeThreadCount],
    ['parentReservedThreads', options.parentReservedThreads],
    ['reviewerReservedThreads', options.reviewerReservedThreads],
    ['marginalUsefulWorkers', options.marginalUsefulWorkers],
    ['marginalUsefulThroughputPositive', options.marginalUsefulThroughputPositive]
  ].filter(([, value]) => value !== undefined))
}

export function explicitlyParallelizable(prompt: unknown): boolean {
  return PARALLELIZABLE_RE.test(String(prompt || ''))
}

function taskProfile(value: unknown, task: string): TaskProfile {
  return isTaskProfile(value) ? value : classifyTaskProfile(task)
}

function normalizeOptions(input: any): Record<string, any> {
  if (typeof input === 'number' && Number.isFinite(input)) return { agents: input }
  return input && typeof input === 'object' && !Array.isArray(input) ? input : {}
}

function firstPositiveNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (positiveNumber(value)) return Math.floor(Number(value))
  }
  return null
}

function positiveNumber(value: unknown): boolean {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0
}

function policyReason(route: any, task: unknown, profile: TaskProfile, required: boolean): string {
  if (!required) return `task_profile_${profile}_does_not_require_subagents`
  if (OFFICIAL_SUBAGENT_ROUTE_KEYS.has(routeKey(route)) || EXPLICIT_SUBAGENT_RE.test(String(task || ''))) {
    return 'explicit_official_subagent_route'
  }
  return `task_profile_${profile}_requires_subagents`
}
