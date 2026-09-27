import { managedOfficialSubagentRoleByName } from '../managed-assets/managed-assets-manifest.js';
import { READ_ONLY_LIST_ROLE } from '../subagents/read-only-list-role.js';
import {
  effectiveChildModelAllowlist,
  isAllowedChildModel,
  type ChildModelAllowlist
} from '../subagents/child-model-allowlist.js';

const SPAWN_TOOLS = new Set(['spawn_agent', 'collaboration.spawn_agent', 'functions.spawn_agent']);

export const SUBAGENT_MODELS_SETTINGS_HINT = 'SKS Control Center > Subagent Models';

/** The OpenRouter Only list as a parent reads it: `a (default), b`. */
export function renderChildModelList(allowlist: ChildModelAllowlist): string {
  if (allowlist.mode !== 'openrouter_only') return allowlist.models.join(', ');
  return allowlist.entries.map((entry) => `${entry.model}${entry.default ? ' (default)' : ''}`).join(', ');
}

/** The OpenRouter Only list with the user's criteria, for parent guidance. */
export function renderChildModelCriteria(allowlist: ChildModelAllowlist): string {
  if (allowlist.mode !== 'openrouter_only') return allowlist.models.join(', ');
  return allowlist.entries
    .map((entry) => `${entry.model}${entry.default ? ' (default)' : ''}: ${entry.criteria || 'general work'}`)
    .join('; ');
}

function openRouterOnlyBlockReason(allowlist: ChildModelAllowlist): string {
  if (!allowlist.models.length && allowlist.mode === 'openrouter_only' && allowlist.unroutable?.length) {
    return `SKS OpenRouter Only mode: no model on the subagent list has an OpenRouter route right now (${allowlist.unroutable.join(', ')}), so no child may be spawned. Ask the user to replace them in ${SUBAGENT_MODELS_SETTINGS_HINT}, then retry spawn_agent. Do not implement the slice in the parent instead.`;
  }
  if (!allowlist.models.length) {
    return `SKS OpenRouter Only mode is on but the subagent model list is empty, so no child may be spawned. Ask the user to add models in ${SUBAGENT_MODELS_SETTINGS_HINT} (or to turn OpenRouter Only off), then retry spawn_agent. Do not implement the slice in the parent instead.`;
  }
  return `SKS OpenRouter Only mode: children may run only a model on the user's subagent list: ${renderChildModelList(allowlist)}. Every other model is denied. Retry spawn_agent with one of them (the SKS hook routes each spawn to a list model, by Jev when Jev mode is on) and fork_turns="none" or a positive bounded turn count. Include the complete slice contract in message; do not inherit the parent model. The user adds models in ${SUBAGENT_MODELS_SETTINGS_HINT}.`;
}

/**
 * A MultiAgent v1 `fork_context: true` copies the whole parent thread into
 * the child, like fork_turns="all", so it cannot be trusted to run the model
 * the spawn names.
 */
export function fullHistoryForkContext(input: Record<string, unknown>): boolean {
  return input.fork_context === true || String(input.fork_context ?? '').trim().toLowerCase() === 'true';
}

/** fork_turns="none" or a positive turn count: a fork that may carry a child model. */
export function boundedForkTurns(value: unknown): boolean {
  return value === 'none' || /^[1-9]\d*$/.test(String(value || ''));
}

const FORK_BLOCK_REASON = 'SKS child spawns require fork_turns="none" or a positive bounded turn count. Retry with the complete slice contract in message; full-history/default forks cannot carry an explicit child model.';

/**
 * Validate before the host selects a child model; SubagentStart is too late.
 * A child must name a model the effective child allowlist permits: one of the
 * current latest tier models, or, in OpenRouter Only mode, one of the user's
 * subagent list models (case-insensitive). It never inherits the parent model
 * or falls back to an older pinned family.
 */
export function subagentSpawnPolicyBlockReason(payload: any = {}): string | null {
  const name = String(payload.tool_name || payload.toolName || payload.tool?.name || '');
  if (!SPAWN_TOOLS.has(name)) return null;
  const input = payload.tool_input || payload.toolInput || payload.tool?.input || {};
  const allowlist = effectiveChildModelAllowlist();
  if (allowlist.mode === 'openrouter_only') {
    if (!isAllowedChildModel(input.model, allowlist)) return openRouterOnlyBlockReason(allowlist);
    // A v1 full-history fork would run the parent's model, which the list may not hold.
    if (fullHistoryForkContext(input)) return `${FORK_BLOCK_REASON} Omit fork_context (fork_context=true is a full-history fork).`;
    // Managed role files pin a tier model, which Codex will not let a spawn override.
    const agent = String(input.agent_type || input.agentType || '').trim();
    if (agent && managedOfficialSubagentRoleByName(agent)) {
      return `SKS OpenRouter Only mode: agent_type "${agent}" pins a tier model, so it cannot run a list model. Omit agent_type and put the role brief in message; read-only slices pass agent_type="${READ_ONLY_LIST_ROLE.codex_name}".`;
    }
  } else {
    const allowed = new Set(allowlist.models);
    if (!allowed.has(String(input.model || ''))) {
      return `SKS children must name a current model: ${[...allowed].join(', ')} (the latest fast, balanced, context, or deep tier). Retry spawn_agent with the slice contract model, which the SKS hook re-seals when Jev mode is on, and fork_turns="none" or a positive bounded turn count. Include the complete slice contract in message; do not inherit the parent model.`;
    }
  }
  if (!boundedForkTurns(input.fork_turns)) return FORK_BLOCK_REASON;
  return null;
}
