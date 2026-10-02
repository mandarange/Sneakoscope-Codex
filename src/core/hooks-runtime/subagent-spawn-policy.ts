import { managedOfficialSubagentRoleByName } from '../managed-assets/managed-assets-manifest.js';
import { READ_ONLY_LIST_ROLE } from '../subagents/read-only-list-role.js';
import { stalePinBlockReason, stalePinForAgentType } from '../subagents/role-model-pins.js';
import { isSpawnAgentToolName, spawnPayloadToolName } from './spawn-tool-name.js';
import {
  effectiveChildModelAllowlist,
  isAllowedChildModel,
  type ChildModelAllowlist
} from '../subagents/child-model-allowlist.js';


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
 * A MultiAgent v1 `fork_context: true` copies the whole parent thread into the
 * child, like fork_turns="all" (the v2 default). SKS keeps children bounded, so
 * it is refused as an SKS rule. Codex honors a model override on a full-history fork
 * in both spawn tools (measured: v2 on 0.153.4 and 0.159.2, the `multi_agent_v1`
 * spawn_agent on 0.153.4), so this is not a Codex limit.
 */
export function fullHistoryForkContext(input: Record<string, unknown>): boolean {
  return input.fork_context === true || String(input.fork_context ?? '').trim().toLowerCase() === 'true';
}

/** fork_turns="none" or a positive turn count: the bounded forks SKS allows for children. */
export function boundedForkTurns(value: unknown): boolean {
  return value === 'none' || /^[1-9]\d*$/.test(String(value || ''));
}

const FORK_BLOCK_REASON = 'SKS policy: child spawns require fork_turns="none" or a positive bounded turn count, so a child starts from its slice contract instead of a copy of the whole parent thread. SKS does not use full-history/default forks for children (Codex itself would run one with a model override; this is an SKS rule, not a Codex restriction). Retry with the complete slice contract in message.';

/**
 * Validate before the host selects a child model; SubagentStart is too late.
 * A child must name a model the effective child allowlist permits: one of the
 * current latest tier models, or, in OpenRouter Only mode, one of the user's
 * subagent list models (case-insensitive). It never inherits the parent model
 * or falls back to an older pinned family. With `root`, a managed role whose
 * file still pins an older tier model is refused too: Codex would run the pin.
 */
export function subagentSpawnPolicyBlockReason(payload: any = {}, opts: { root?: string } = {}): string | null {
  if (!isSpawnAgentToolName(spawnPayloadToolName(payload))) return null;
  const input = payload.tool_input || payload.toolInput || payload.tool?.input || {};
  const allowlist = effectiveChildModelAllowlist();
  if (allowlist.mode === 'openrouter_only') {
    if (!isAllowedChildModel(input.model, allowlist)) return openRouterOnlyBlockReason(allowlist);
    // SKS keeps children bounded: a v1 full-history fork copies the parent thread.
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
    const stale = opts.root ? stalePinForAgentType(String(input.agent_type || input.agentType || ''), { root: opts.root }) : null;
    if (stale) return stalePinBlockReason(stale);
  }
  if (!boundedForkTurns(input.fork_turns)) return FORK_BLOCK_REASON;
  return null;
}
