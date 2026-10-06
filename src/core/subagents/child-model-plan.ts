import { chooseChildModels, type ChildModelChoice, type ChildModelLane } from '../decisions/child-model-choice.js'
import { MAX_JEV_ROUTING_ROLES } from '../decisions/routing.js'
import {
  defaultSubagentEntry,
  effectiveChildModelAllowlist,
  childModelListProfile,
  listChildModelEffort,
  type ChildModelAllowlist,
  type ListChildModelAllowlist,
  type OpenRouterOnlyLocation,
  type OpenRouterOnlyState,
  type SubagentModelEntry
} from './child-model-allowlist.js'
import { readCodexMainModel } from './naruto-host-credentials.js'
import type { OfficialSubagentSlice } from './official-subagent-prompt.js'
import { READ_ONLY_LIST_ROLE } from './read-only-list-role.js'

/**
 * Plan-time child models for OpenRouter Only Mode (Naruto and generic
 * parallel overlays). Every routed role gets a model from the user's list:
 * Jev reads the entry criteria and picks one per role in a single Decisions
 * call; any role Jev does not decide keeps the list's default entry. Tier
 * routing and role-model preferences never apply in this mode.
 */

export type ListChildModels = ListChildModelAllowlist

export interface ChildModelPlanContext {
  /** Every child decision in this plan reads this one allowlist. */
  allowlist: ChildModelAllowlist
  /** Set whenever an explicit connection-specific list controls children. */
  list: {
    state: Pick<OpenRouterOnlyState, 'subagent_models'>
    allowlist: ListChildModels
    /** Top-level `model` in the Codex config.toml: the parent in this mode. */
    mainModel: string | null
  } | null
}

/**
 * Read the mode store once per plan. The allowlist, the role-preference
 * decision, and the Jev lanes all derive from this one read, so a flip by the
 * bridge controller mid-plan cannot leave them disagreeing.
 */
export function readChildModelPlanContext(location: OpenRouterOnlyLocation = {}): ChildModelPlanContext {
  const allowlist = effectiveChildModelAllowlist(location)
  if (allowlist.mode === 'tiers') return { allowlist, list: null }
  const state = { subagent_models: allowlist.entries }
  return { allowlist, list: { state, allowlist, mainModel: readCodexMainModel(location) } }
}

/** The entry's effort, else the role's effort when OpenRouter lists it, else none (model default). */
export function listEntryEffort(entry: SubagentModelEntry, roleEffort: unknown): string | null {
  return listChildModelEffort(entry, roleEffort)
}

function routedRow(row: Record<string, any>, choice: ChildModelChoice | null, list: ListChildModelAllowlist) {
  const prefix = list.mode === 'openrouter_only' ? 'openrouter_only' : 'configured_list'
  return {
    ...row,
    routed_provider: list.mode === 'openrouter_only' ? 'openrouter' : list.profile === 'codex_lb' ? 'codex-lb' : 'openai',
    routed_model: choice?.entry.model ?? null,
    routed_model_reasoning_effort: choice ? listEntryEffort(choice.entry, row.model_reasoning_effort) : null,
    routed_model_policy: `${prefix}_${choice?.source === 'jev' ? 'jev' : 'default'}`,
    routing_dynamic: true,
    role_model_preference_source: `ignored_${prefix}`,
    [list.mode === 'openrouter_only' ? 'openrouter_only_choice' : 'subagent_list_choice']: choice
      ? { model: choice.entry.model, source: choice.source, reason: choice.reason, default_entry: choice.entry.default }
      : { model: null, source: 'default', reason: 'subagent_list_empty', default_entry: false }
  }
}

/** Before Jev answers: every role on the default entry. */
export function listBaselineAgentRouting(
  agentRouting: Record<string, any>,
  list: NonNullable<ChildModelPlanContext['list']>
): Record<string, any> {
  const fallback = defaultSubagentEntry(list.state)
  const choice: ChildModelChoice | null = fallback ? { entry: fallback, source: 'default', reason: 'baseline' } : null
  return Object.fromEntries(Object.entries(agentRouting).map(([name, row]) => [name, routedRow(row, choice, list.allowlist)]))
}

/**
 * One lane per routed role, slice-assigned roles first, at most the Jev routing
 * cap. The mission goal travels once as the request goal, not in every lane.
 */
export function childModelLanes(input: {
  agents: Record<string, any>
  slices: readonly OfficialSubagentSlice[]
}): ChildModelLane[] {
  const assigned = new Set(input.slices.map((slice) => String(slice.agent || '')).filter(Boolean))
  const names = Object.keys(input.agents)
  const ordered = [...names.filter((name) => assigned.has(name)), ...names.filter((name) => !assigned.has(name))]
  return ordered.slice(0, MAX_JEV_ROUTING_ROLES).map((name) => {
    const own = input.slices.filter((slice) => slice.agent === name)
    const work = own.length
      ? own.map((slice) => `${slice.title}: ${slice.description}${slice.readOnly ? ' (read-only)' : ''}`).join('\n')
      : `Role ${name}: ${String(input.agents[name]?.description || name)}`
    return { id: name, role: name, task: work, requestedModel: null }
  })
}

/**
 * One Jev call for the plan's routed roles. Never throws: a failure leaves
 * every role on the default entry with the reason recorded.
 */
export async function chooseListRoleModels(input: {
  root: string
  goal: string
  agents: Record<string, any>
  slices: readonly OfficialSubagentSlice[]
  list: NonNullable<ChildModelPlanContext['list']>
  env?: NodeJS.ProcessEnv
}): Promise<{ lanes: string[]; choices: Record<string, ChildModelChoice> }> {
  const lanes = childModelLanes(input)
  try {
    const choices = await chooseChildModels({
      root: input.root,
      workflowId: 'plan-child-models',
      goal: input.goal || 'Plan official subagent roles.',
      lanes,
      state: input.list.state,
      profile: childModelListProfile(input.list.allowlist),
      ...(input.env ? { env: input.env } : {})
    })
    return { lanes: lanes.map((lane) => lane.id), choices }
  } catch {
    const fallback = defaultSubagentEntry(input.list.state)
    const choices: Record<string, ChildModelChoice> = {}
    if (fallback) for (const lane of lanes) choices[lane.id] = { entry: fallback, source: 'default', reason: 'transport_error' }
    return { lanes: lanes.map((lane) => lane.id), choices }
  }
}

/**
 * Why a role past the lane cap kept the default: when no lane reached Jev
 * (off, no key, one entry, a failed call) it is that shared reason; only when
 * Jev did decide is the cap itself the reason.
 */
function uncappedReason(lanes: readonly string[], choices: Record<string, ChildModelChoice>): string {
  const reasons = new Set(lanes.map((lane) => choices[lane]?.reason).filter((reason): reason is string => Boolean(reason)))
  const decided = lanes.some((lane) => choices[lane]?.source === 'jev' || choices[lane]?.reason === 'keep_baseline')
  return !decided && reasons.size === 1 ? [...reasons][0]! : 'role_cap'
}

/**
 * Seal the chosen list entries onto the plan rows and build the evidence that
 * subagent-plan.json records: which entry each role got and why.
 */
export function applyListRoleModels(
  agents: Record<string, any>,
  chosen: { lanes: string[]; choices: Record<string, ChildModelChoice> } | null,
  list: NonNullable<ChildModelPlanContext['list']>,
  /** Whether the project has the model-less read-only role; null when not checked. */
  readOnlyRoleInstalled: boolean | null = null
): { agents: Record<string, any>; evidence: Record<string, unknown>; jevModels: Record<string, string> } {
  const fallback = defaultSubagentEntry(list.state)
  const lanes = chosen?.lanes || []
  const routed = new Set(lanes)
  const capped = chosen ? uncappedReason(lanes, chosen.choices) : 'role_cap'
  const next: Record<string, any> = {}
  const roles: Record<string, unknown> = {}
  const jevModels: Record<string, string> = {}
  for (const [name, row] of Object.entries(agents)) {
    const choice = chosen?.choices[name]
      ?? (fallback ? { entry: fallback, source: 'default' as const, reason: routed.has(name) ? 'keep_baseline' : capped } : null)
    next[name] = routedRow(row, choice, list.allowlist)
    roles[name] = next[name].openrouter_only_choice ?? next[name].subagent_list_choice
    if (choice?.source === 'jev') jevModels[name] = choice.entry.model
  }
  return {
    agents: next,
    jevModels,
    evidence: {
      enabled: true,
      ...(list.allowlist.mode === 'configured' ? { profile: list.allowlist.profile } : {}),
      main_model: list.mainModel,
      default_subagent_model: fallback?.model ?? null,
      subagent_models: list.state.subagent_models.map((entry) => ({ ...entry })),
      // Roles offered to the child-model decision (at most the lane cap); the
      // per-role reason says whether Jev actually decided each one.
      routed_roles: [...lanes],
      jev_decided_roles: Object.keys(jevModels),
      roles,
      read_only_role: { name: READ_ONLY_LIST_ROLE.codex_name, installed: readOnlyRoleInstalled },
      warnings: readOnlyRoleInstalled === false ? [`${list.allowlist.mode === 'openrouter_only' ? 'openrouter_only' : 'subagent_list'}_read_only_role_missing`] : []
    }
  }
}
