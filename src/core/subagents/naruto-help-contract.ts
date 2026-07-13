import {
  NARUTO_PARENT_EFFORT,
  NARUTO_PARENT_MODEL
} from './model-policy.js'
import { DEFAULT_NARUTO_REQUESTED_SUBAGENTS } from './thread-budget.js'
import {
  MAX_AUTOMATIC_REVIEWER_COUNT,
  MAX_AUTOMATIC_SUBAGENT_COUNT,
  officialSubagentRolePlan
} from './agent-catalog.js'

export const NARUTO_HELP_SCHEMA = 'sks.naruto-subagent-workflow.v1'

export function buildNarutoHelpResult() {
  return {
    schema: NARUTO_HELP_SCHEMA,
    ok: true,
    action: 'help',
    workflow: 'official_codex_subagent',
    description: '$Naruto is the SKS alias for the Codex official subagent workflow.',
    usage: [
      'sks naruto run "<task>" [--agents N] [--max-threads N] [--json]',
      'sks naruto status [latest|M-...] [--json]',
      'sks naruto subagents [latest|M-...] [--json]',
      'sks naruto proof [latest|M-...] [--json]'
    ],
    commands: ['help', 'status', 'subagents', 'proof', 'run'],
    default_requested_subagents: DEFAULT_NARUTO_REQUESTED_SUBAGENTS,
    scaling_policy: 'one_safe_direct_child_by_default_parent_owned_risk_based_expansion',
    automatic_subagent_ceiling: MAX_AUTOMATIC_SUBAGENT_COUNT,
    automatic_reviewer_ceiling: MAX_AUTOMATIC_REVIEWER_COUNT,
    critical_multi_domain_reviewer_ceiling: MAX_AUTOMATIC_SUBAGENT_COUNT,
    max_depth: 1,
    triwiki_context: 'bounded_attention_use_first_with_on_demand_hydration',
    completion_evidence: {
      lifecycle_events: ['SubagentStart', 'SubagentStop'],
      stop_is_success_evidence: false,
      structured_parent_summary: 'subagent-parent-summary.json'
    },
    deprecated_aliases: {
      '--clones N': '--agents N',
      workers: 'subagents'
    },
    legacy_process_runtime_available: false,
    parent: { model: NARUTO_PARENT_MODEL, model_reasoning_effort: NARUTO_PARENT_EFFORT },
    agents: officialSubagentRolePlan()
  }
}
