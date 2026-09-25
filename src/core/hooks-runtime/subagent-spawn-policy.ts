import { latestTierModelSet } from '../subagents/model-tiers.js';

const SPAWN_TOOLS = new Set(['spawn_agent', 'collaboration.spawn_agent', 'functions.spawn_agent']);

/**
 * Validate before the host selects a child model; SubagentStart is too late.
 * A child must name one of the current latest tier models explicitly, so it
 * never inherits the parent model or falls back to an older pinned family.
 */
export function subagentSpawnPolicyBlockReason(payload: any = {}): string | null {
  const name = String(payload.tool_name || payload.toolName || payload.tool?.name || '');
  if (!SPAWN_TOOLS.has(name)) return null;
  const input = payload.tool_input || payload.toolInput || payload.tool?.input || {};
  const allowed = latestTierModelSet();
  if (!allowed.has(String(input.model || ''))) {
    return `SKS children must name a current model: ${[...allowed].join(', ')} (the latest fast, balanced, context, or deep tier). Retry spawn_agent with the slice contract model, which the SKS hook re-seals when Jev mode is on, and fork_turns="none" or a positive bounded turn count. Include the complete slice contract in message; do not inherit the parent model.`;
  }
  if (input.fork_turns !== 'none' && !/^[1-9]\d*$/.test(String(input.fork_turns || ''))) {
    return 'SKS child spawns require fork_turns="none" or a positive bounded turn count. Retry with the complete slice contract in message; full-history/default forks cannot carry an explicit child model.';
  }
  return null;
}
