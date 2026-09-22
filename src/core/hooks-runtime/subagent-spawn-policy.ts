import {
  ASTRA_SUBAGENT_MODEL,
  NARUTO_LUNA_MODEL,
  NARUTO_SOL_MODEL,
  NARUTO_TERRA_MODEL
} from '../subagents/model-policy.js';

const SPAWN_TOOLS = new Set(['spawn_agent', 'collaboration.spawn_agent', 'functions.spawn_agent']);
const SEALED_CHILD_MODELS = new Set([
  ASTRA_SUBAGENT_MODEL,
  NARUTO_LUNA_MODEL,
  NARUTO_SOL_MODEL,
  NARUTO_TERRA_MODEL
]);

/** Validate before the host selects a child model; SubagentStart is too late. */
export function subagentSpawnPolicyBlockReason(payload: any = {}): string | null {
  const name = String(payload.tool_name || payload.toolName || payload.tool?.name || '');
  if (!SPAWN_TOOLS.has(name)) return null;
  const input = payload.tool_input || payload.toolInput || payload.tool?.input || {};
  if (!SEALED_CHILD_MODELS.has(String(input.model || ''))) {
    return 'SKS children must use a sealed model: gpt-5.6-luna, gpt-5.6-sol, gpt-5.6-terra, or gpt-6-astra. Retry spawn_agent with that model, task-appropriate reasoning_effort, and fork_turns="none" or a positive bounded turn count. Include the complete slice contract in message; do not inherit the parent model.';
  }
  if (input.fork_turns !== 'none' && !/^[1-9]\d*$/.test(String(input.fork_turns || ''))) {
    return 'SKS Astra child spawns require fork_turns="none" or a positive bounded turn count. Retry with the complete slice contract in message; full-history/default forks cannot carry an explicit child model.';
  }
  return null;
}
