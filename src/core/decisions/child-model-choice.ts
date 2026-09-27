import { consultJevOptions } from './integration.js'
import type { OptionQuestion } from './types.js'
import {
  canonicalChildModelId,
  defaultSubagentEntry,
  subagentEntryForModel,
  type OpenRouterOnlyState,
  type SubagentModelEntry
} from '../subagents/child-model-allowlist.js'

/**
 * OpenRouter Only Mode: Jev routes each child to a model on the user's list,
 * reading the criteria the user wrote for every entry. Jev can only answer
 * with an option SKS listed, and every other outcome (Jev off, no key, busy,
 * unsure, one entry) falls back inside the list: the parent's requested model
 * when it is listed, else the default entry. No path returns an unlisted model.
 */

export type ChildModelChoiceSource = 'jev' | 'requested' | 'default'

export interface ChildModelChoice {
  entry: SubagentModelEntry
  source: ChildModelChoiceSource
  /** Why Jev did not decide, or 'applied'. */
  reason: string
}

export interface ChildModelLane {
  /** Unique per call; becomes part of the question id. */
  id: string
  task: string
  role?: string | null
  requestedModel?: string | null
}

// Decisions requests are capped at 24 KB; lanes past this share of it keep the fallback.
const QUESTION_BUDGET_BYTES = 16_000
const TASK_CHARS = 1200

function optionId(index: number): string {
  return `m${index + 1}`
}

function optionSummary(entry: SubagentModelEntry): string {
  const criteria = entry.criteria || 'General work; no special criteria.'
  return `${entry.model}${entry.default ? ' (default)' : ''}: ${criteria}`
}

function laneQuestionId(lane: ChildModelLane, index: number): string {
  const slug = String(lane.id || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24)
  return `child_model_${slug || index}`.slice(0, 40)
}

export function childModelQuestion(id: string, entries: readonly SubagentModelEntry[], lane: ChildModelLane): OptionQuestion {
  const options: Record<string, string> = {}
  entries.forEach((entry, index) => { options[optionId(index)] = optionSummary(entry) })
  const fallback = entries.findIndex((entry) => entry.default)
  return {
    id,
    instructions: 'Choose the model on the user\'s list that should run the child task in state.task. Each option is the user\'s rule for when to use that model; follow those rules. When several fit equally, choose the default.',
    options,
    state: {
      task: String(lane.task || '').slice(0, TASK_CHARS),
      role: lane.role || null,
      requested_model: lane.requestedModel || null,
      default_option: optionId(fallback === -1 ? 0 : fallback)
    }
  }
}

export function fallbackChildModel(state: OpenRouterOnlyState, requestedModel: unknown, reason: string): ChildModelChoice | null {
  const requested = subagentEntryForModel(state, requestedModel)
  if (requested) return { entry: requested, source: 'requested', reason }
  const fallback = defaultSubagentEntry(state)
  return fallback ? { entry: fallback, source: 'default', reason } : null
}

/**
 * One Decisions call for all lanes. Returns a choice per lane id; a lane is
 * missing only when the list is empty.
 */
export async function chooseChildModels(input: {
  root: string
  workflowId: string
  goal: string
  lanes: readonly ChildModelLane[]
  state: OpenRouterOnlyState
  env?: NodeJS.ProcessEnv
  deadlineMs?: number
}): Promise<Record<string, ChildModelChoice>> {
  const entries = input.state.subagent_models
  const result: Record<string, ChildModelChoice> = {}
  if (!entries.length) return result
  const fallbackAll = (reason: string) => {
    for (const lane of input.lanes) {
      const choice = fallbackChildModel(input.state, lane.requestedModel, reason)
      if (choice) result[lane.id] = choice
    }
    return result
  }
  if (entries.length === 1) return fallbackAll('single_entry')

  const asked: Array<{ lane: ChildModelLane; questionId: string }> = []
  const questions: OptionQuestion[] = []
  let bytes = 0
  input.lanes.forEach((lane, index) => {
    const questionId = laneQuestionId(lane, index)
    if (asked.some((row) => row.questionId === questionId)) return
    const question = childModelQuestion(questionId, entries, lane)
    const size = Buffer.byteLength(JSON.stringify(question))
    if (bytes + size > QUESTION_BUDGET_BYTES) return
    bytes += size
    asked.push({ lane, questionId })
    questions.push(question)
  })
  const decision = questions.length
    ? await consultJevOptions({
      root: input.root,
      workflowId: input.workflowId,
      goal: input.goal,
      questions,
      facts: { openrouter_only: true, subagent_models: entries.map((entry) => canonicalChildModelId(entry.model)) },
      ...(input.env ? { env: input.env } : {}),
      ...(input.deadlineMs === undefined ? {} : { deadlineMs: input.deadlineMs })
    })
    : { called: false, choices: {} as Record<string, string>, reason: 'budget' }
  for (const lane of input.lanes) {
    const questionId = asked.find((row) => row.lane === lane)?.questionId
    const picked = questionId ? decision.choices[questionId] : undefined
    const pickedIndex = picked && /^m\d+$/.test(picked) ? Number(picked.slice(1)) - 1 : -1
    const entry = pickedIndex >= 0 ? entries[pickedIndex] : undefined
    if (entry) {
      result[lane.id] = { entry, source: 'jev', reason: 'applied' }
      continue
    }
    const reason = !questionId ? 'budget' : decision.reason === 'applied' ? 'keep_baseline' : decision.reason
    const choice = fallbackChildModel(input.state, lane.requestedModel, reason)
    if (choice) result[lane.id] = choice
  }
  return result
}

/** The per-spawn form: one child, one question. */
export async function chooseChildModel(input: {
  root: string
  task: string
  role?: string | null
  requestedModel?: string | null
  state: OpenRouterOnlyState
  env?: NodeJS.ProcessEnv
  deadlineMs?: number
}): Promise<ChildModelChoice | null> {
  const choices = await chooseChildModels({
    root: input.root,
    workflowId: 'spawn-child-model',
    goal: input.task || 'Spawn a child agent.',
    lanes: [{ id: 'spawn', task: input.task, role: input.role ?? null, requestedModel: input.requestedModel ?? null }],
    state: input.state,
    ...(input.env ? { env: input.env } : {}),
    ...(input.deadlineMs === undefined ? {} : { deadlineMs: input.deadlineMs })
  })
  return choices.spawn ?? null
}
