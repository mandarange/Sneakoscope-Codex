import { managedOfficialSubagentRoleByName } from '../managed-assets/managed-assets-manifest.js';
import { READ_ONLY_LIST_ROLE, readOnlyListRoleInstalled } from '../subagents/read-only-list-role.js';
import { stalePinBlockReason, stalePinForAgentType } from '../subagents/role-model-pins.js';
import { isSpawnAgentToolName, spawnPayloadToolName } from './spawn-tool-name.js';
import {
  effectiveChildModelAllowlist,
  childModelListLabel,
  isAllowedChildModel,
  isAllowedChildModelEffort,
  subagentEntryLabel,
  type ChildModelAllowlist,
  type ListChildModelAllowlist
} from '../subagents/child-model-allowlist.js';


export const SUBAGENT_MODELS_SETTINGS_HINT = 'SKS Control Center > Subagent Models';

/** The OpenRouter Only list as a parent reads it: `a (default), b`. */
export function renderChildModelList(allowlist: ChildModelAllowlist): string {
  if (allowlist.mode === 'tiers') return allowlist.models.join(', ');
  return allowlist.entries.map((entry) => `${subagentEntryLabel(entry)}${entry.default ? ' (default)' : ''}`).join(', ');
}

/** The OpenRouter Only list with the user's criteria, for parent guidance. */
export function renderChildModelCriteria(allowlist: ChildModelAllowlist): string {
  if (allowlist.mode === 'tiers') return allowlist.models.join(', ');
  return allowlist.entries
    .map((entry) => `${subagentEntryLabel(entry)}${entry.default ? ' (default)' : ''}: ${entry.criteria || 'general work'}`)
    .join('; ');
}

function openRouterOnlyBlockReason(allowlist: ListChildModelAllowlist): string {
  const label = childModelListLabel(allowlist);
  if (!allowlist.models.length && allowlist.unroutable?.length) {
    return `SKS ${label} mode: no model on the subagent list is available with its saved effort right now (${allowlist.unroutable.join(', ')}), so no child may be spawned. Ask the user to replace them in ${SUBAGENT_MODELS_SETTINGS_HINT}, then retry spawn_agent. Do not implement the slice in the parent instead.`;
  }
  if (!allowlist.models.length) {
    return `SKS ${label} mode: the subagent model list is empty or unavailable, so no child may be spawned. Ask the user to review the list in ${SUBAGENT_MODELS_SETTINGS_HINT}, then retry spawn_agent. Do not implement the slice in the parent instead.`;
  }
  return `SKS ${label} mode: children may run only a model on the user's subagent list: ${renderChildModelList(allowlist)}. Every other model is denied. Retry spawn_agent with one of them (the SKS hook routes each spawn to a list model, by Jev when Jev mode is on) and fork_turns="none" or a positive bounded turn count. Include the complete slice contract in message; do not inherit the parent model. The user adds models in ${SUBAGENT_MODELS_SETTINGS_HINT}.`;
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
export function subagentSpawnPolicyBlockReason(payload: any = {}, opts: { root?: string; narutoParent?: boolean; spawnDepth?: number } = {}): string | null {
  if (!isSpawnAgentToolName(spawnPayloadToolName(payload))) return null;
  const input = payload.tool_input || payload.toolInput || payload.tool?.input || {};
  if (Number(opts.spawnDepth ?? input.spawn_depth ?? 0) >= 1) return 'SKS child boundary: spawn_depth=1 is terminal; ask the main parent for decomposition through the bounded message protocol.';
  const allowlist = effectiveChildModelAllowlist();
  // Tier and fork rules are Naruto's child contract. Outside a Naruto parent a
  // spawn is Codex's own, the way Codex works by default; OpenRouter Only
  // still applies everywhere, because the mode itself forbids other models.
  if (allowlist.mode === 'tiers' && opts.narutoParent === false) return null;
  if (allowlist.mode !== 'tiers') {
    if (!isAllowedChildModel(input.model, allowlist)) return openRouterOnlyBlockReason(allowlist);
    // SKS keeps children bounded: a v1 full-history fork copies the parent thread.
    if (fullHistoryForkContext(input)) return `${FORK_BLOCK_REASON} Omit fork_context (fork_context=true is a full-history fork).`;
    // Managed role files pin a tier model, which Codex will not let a spawn override.
    const agent = String(input.agent_type || input.agentType || '').trim();
    if (allowlist.mode === 'configured' && agent && agent !== READ_ONLY_LIST_ROLE.codex_name) {
      return `SKS ${childModelListLabel(allowlist)} subagent list: agent_type "${agent}" may pin its own model or effort, which Codex uses instead of the spawn values. Omit agent_type and include the role brief in message; read-only slices must use agent_type="${READ_ONLY_LIST_ROLE.codex_name}".`;
    }
    if (allowlist.mode === 'configured' && agent === READ_ONLY_LIST_ROLE.codex_name && opts.root && !readOnlyListRoleInstalled(opts.root)) {
      return `SKS could not verify the model-less read-only role for this project. A missing role or custom role/config override must be resolved before retrying ${READ_ONLY_LIST_ROLE.codex_name}; do not remove the role to bypass its read-only sandbox.`;
    }
    if (agent && managedOfficialSubagentRoleByName(agent)) {
      return `SKS ${childModelListLabel(allowlist)} mode: agent_type "${agent}" pins a tier model, so it cannot run a list model. Omit agent_type and put the role brief in message; read-only slices pass agent_type="${READ_ONLY_LIST_ROLE.codex_name}".`;
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
  if (allowlist.mode !== 'tiers' && !isAllowedChildModelEffort(input.model, input.reasoning_effort, allowlist)) {
    return `SKS ${childModelListLabel(allowlist)} subagent list: the model and reasoning_effort must match a listed option: ${renderChildModelList(allowlist)}. Retry with the selected option's effort.`;
  }
  return null;
}
