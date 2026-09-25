import { consultJevTurnModel } from '../decisions/integration.js';
import { managedOfficialSubagentRoleByName } from '../managed-assets/managed-assets-manifest.js';
import { subagentModelProfile } from '../subagents/model-policy.js';
import { effortForTier, latestModelForTier, latestTierModelSet } from '../subagents/model-tiers.js';
import { readRoleModelPreferences } from '../subagents/role-model-preferences.js';

const SPAWN_TOOLS = new Set(['spawn_agent', 'collaboration.spawn_agent', 'functions.spawn_agent']);

function spawnInput(payload: any): Record<string, unknown> | null {
  const name = String(payload?.tool_name || payload?.toolName || payload?.tool?.name || '');
  if (!SPAWN_TOOLS.has(name)) return null;
  const input = payload?.tool_input || payload?.toolInput || payload?.tool?.input;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  return { ...input };
}

function narutoParent(state: any): boolean {
  const mode = String(state?.mode || '').toUpperCase();
  const route = String(state?.route || state?.route_command || '').replace(/^\$/, '').toUpperCase();
  return mode === 'NARUTO' || route === 'NARUTO' || state?.subagents_required === true;
}

function spawnTask(input: Record<string, unknown>): string {
  return [input.message, input.prompt, input.task, input.agent_type, input.agentType]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 1200);
}

/**
 * The latest model and effort for a role when Jev cannot seal the spawn: the
 * role's own tier (fast for mechanical roles, deep for judgment roles), or the
 * deep tier for an unknown role.
 */
export function roleTierFallback(agentType: string): { model: string; effort: string } {
  const role = agentType ? managedOfficialSubagentRoleByName(agentType) : null;
  if (role?.model_policy) {
    const profile = subagentModelProfile(role.model_policy);
    return { model: profile.model, effort: effortForTier(profile.tier) };
  }
  return { model: latestModelForTier('deep'), effort: effortForTier('deep') };
}

/**
 * Naruto child spawn: Jev picks the tier and SKS seals the newest model of
 * that tier. An open parent thread is not rerouted. When Jev was called but
 * could not seal the spawn, a child that carries no current model gets its
 * role's tier instead of bouncing off the spawn policy, so the parent keeps
 * delegating instead of retrying alone.
 */
export async function jevSpawnModelRewrite(
  root: string,
  state: any,
  payload: any
): Promise<Record<string, unknown> | null> {
  if (!narutoParent(state)) return null;
  const input = spawnInput(payload);
  if (!input) return null;
  const agent = String(input.agent_type || input.agentType || '').trim();
  if (agent) {
    const preferences = await readRoleModelPreferences().catch(() => null);
    if (preferences?.store.roles[agent]) return null;
  }
  const task = spawnTask(input);
  if (!task) return null;
  const decision = await consultJevTurnModel({ root, prompt: task, roleId: 'spawn' }).catch(() => null);
  if (!decision?.called) return null;
  const forkTurns = input.fork_turns === undefined ? { fork_turns: 'none' } : {};
  if (!decision.model || !decision.effort) {
    if (latestTierModelSet().has(String(input.model || ''))) return null;
    const fallback = roleTierFallback(agent);
    return { ...input, model: fallback.model, reasoning_effort: fallback.effort, ...forkTurns };
  }
  if (input.model === decision.model && input.reasoning_effort === decision.effort) return null;
  return {
    ...input,
    model: decision.model,
    reasoning_effort: decision.effort,
    ...forkTurns
  };
}
