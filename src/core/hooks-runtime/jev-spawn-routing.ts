import { consultJevTurnModel } from '../decisions/integration.js';
import {
  chooseChildModel,
  fallbackChildModel,
  type ChildModelChoice,
  type ChildModelChoiceSource
} from '../decisions/child-model-choice.js';
import { managedOfficialSubagentRoleByName } from '../managed-assets/managed-assets-manifest.js';
import {
  OPENROUTER_ONLY_SCHEMA,
  effectiveChildModelAllowlist,
  isSubagentModelEffort,
  type ChildModelAllowlist,
  type OpenRouterOnlyState
} from '../subagents/child-model-allowlist.js';
import { subagentModelProfile } from '../subagents/model-policy.js';
import { effortForTier, latestModelForTier, latestTierModelSet } from '../subagents/model-tiers.js';
import { readRoleModelPreferences } from '../subagents/role-model-preferences.js';
import { READ_ONLY_LIST_ROLE } from '../subagents/read-only-list-role.js';
import {
  boundedForkTurns,
  fullHistoryForkContext,
  renderChildModelList,
  SUBAGENT_MODELS_SETTINGS_HINT
} from './subagent-spawn-policy.js';

const SPAWN_TOOLS = new Set(['spawn_agent', 'collaboration.spawn_agent', 'functions.spawn_agent']);

/** Which list entry an OpenRouter Only spawn got, and why. */
export interface OpenRouterOnlySpawnRoute {
  mode: 'openrouter_only';
  model: string;
  source: ChildModelChoiceSource;
  /** 'applied' when Jev decided, else why the fallback ran (off, missing_key, single_entry, ...). */
  reason: string;
}

export interface JevSpawnRouting {
  /** The rewritten spawn input, or null to leave the call as written. */
  input: Record<string, unknown> | null;
  route: OpenRouterOnlySpawnRoute | null;
}

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

/** The text parts of a MultiAgent v1 `items` input ("Use either message or items"). */
function itemTexts(items: unknown): unknown[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => item && typeof item === 'object' && (item as Record<string, unknown>).type === 'text')
    .map((item) => (item as Record<string, unknown>).text);
}

function spawnTask(input: Record<string, unknown>, opts: { items?: boolean } = {}): string {
  const items = opts.items ? itemTexts(input.items) : [];
  return [input.message, input.prompt, input.task, ...items, input.agent_type, input.agentType]
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
 * Route one spawn_agent call. OpenRouter Only mode routes EVERY spawn to a
 * model on the user's list (Jev reads the list criteria when it is on); with
 * the mode off only Naruto parents are re-sealed to a tier model. The spawn
 * policy then checks the rewritten input, so an unlisted model never passes.
 */
export async function jevSpawnRouting(root: string, state: any, payload: any): Promise<JevSpawnRouting> {
  const input = spawnInput(payload);
  if (!input) return { input: null, route: null };
  const allowlist = effectiveChildModelAllowlist();
  if (allowlist.mode === 'openrouter_only') return openRouterOnlySpawnRouting(root, state, input, allowlist);
  return { input: await tierSpawnRewrite(root, state, input), route: null };
}

/** The rewritten spawn input only; see jevSpawnRouting. */
export async function jevSpawnModelRewrite(
  root: string,
  state: any,
  payload: any
): Promise<Record<string, unknown> | null> {
  return (await jevSpawnRouting(root, state, payload)).input;
}

function listState(allowlist: Extract<ChildModelAllowlist, { mode: 'openrouter_only' }>): OpenRouterOnlyState {
  return { schema: OPENROUTER_ONLY_SCHEMA, enabled: true, subagent_models: allowlist.entries, restore: null, updated_at: null };
}

/**
 * OpenRouter Only spawn: role-model preferences are ignored, Jev picks a list
 * entry from the user's criteria, and every other outcome stays inside the
 * list (a listed requested model, else the default entry). An empty list or a
 * full-history fork leaves the call as written so the spawn policy denies it.
 * Only a Naruto parent (whose slice contract is the whole message) gets a
 * missing fork_turns filled with "none", as in tier mode; any other parent is
 * told to choose a bounded fork itself instead of silently losing history.
 */
async function openRouterOnlySpawnRouting(
  root: string,
  parentState: any,
  input: Record<string, unknown>,
  allowlist: Extract<ChildModelAllowlist, { mode: 'openrouter_only' }>
): Promise<JevSpawnRouting> {
  if (fullHistoryForkContext(input)) return { input: null, route: null };
  const forkTurns = input.fork_turns === undefined && narutoParent(parentState) ? 'none' : input.fork_turns;
  if (!boundedForkTurns(forkTurns)) return { input: null, route: null };
  const state = listState(allowlist);
  const requested = String(input.model || '').trim() || null;
  const agent = String(input.agent_type || input.agentType || '').trim() || null;
  const task = spawnTask(input, { items: true });
  const choice: ChildModelChoice | null = task
    ? await chooseChildModel({ root, task, role: agent, requestedModel: requested, state })
      .catch(() => fallbackChildModel(state, requested, 'consult_failed'))
    : fallbackChildModel(state, requested, 'empty_task');
  if (!choice) return { input: null, route: null };
  const route: OpenRouterOnlySpawnRoute = {
    mode: 'openrouter_only',
    model: choice.entry.model,
    source: choice.source,
    reason: choice.reason
  };
  const next: Record<string, unknown> = { ...input, model: choice.entry.model };
  // A managed role file pins a tier model that would override the list model:
  // a read-only role keeps its sandbox through the model-less list role, any
  // other managed role is dropped (its brief travels in message).
  const managed = agent ? managedOfficialSubagentRoleByName(agent) : null;
  if (managed) {
    delete next.agentType;
    if (managed.sandbox === 'read-only') next.agent_type = READ_ONLY_LIST_ROLE.codex_name;
    else delete next.agent_type;
  }
  // The entry's effort wins; otherwise keep only an effort every list model
  // accepts, and let Codex use the model default for anything else.
  const effort = choice.entry.reasoning_effort
    || (isSubagentModelEffort(input.reasoning_effort) ? input.reasoning_effort : null);
  if (effort) next.reasoning_effort = effort;
  else delete next.reasoning_effort;
  next.fork_turns = forkTurns;
  const unchanged = !managed
    && input.model === next.model
    && input.reasoning_effort === next.reasoning_effort
    && Object.hasOwn(input, 'reasoning_effort') === Object.hasOwn(next, 'reasoning_effort')
    && input.fork_turns === next.fork_turns;
  return { input: unchanged ? null : next, route };
}

/**
 * Naruto child spawn: Jev picks the tier and SKS seals the newest model of
 * that tier. An open parent thread is not rerouted. When Jev was called but
 * could not seal the spawn, a child that carries no current model gets its
 * role's tier instead of bouncing off the spawn policy, so the parent keeps
 * delegating instead of retrying alone.
 */
async function tierSpawnRewrite(
  root: string,
  state: any,
  input: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  if (!narutoParent(state)) return null;
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

/**
 * The UserPromptSubmit Jev line in OpenRouter Only mode: the turn's effort
 * hint, and the list children run on instead of a tier model.
 */
export function openRouterOnlyJevTurnLine(
  allowlist: Extract<ChildModelAllowlist, { mode: 'openrouter_only' }>,
  effort: string | null,
  orchestrationRequired: boolean
): string {
  const hint = effort
    ? `Jev rated this ${orchestrationRequired ? 'task' : 'turn'} as ${effort}-effort work; the parent model, effort, and service tier stay as the user set them. `
    : '';
  const list = allowlist.entries.length
    ? `every spawn_agent child runs a model from the user's subagent list (${renderChildModelList(allowlist)}); Jev picks the list model for each spawn from the user's criteria, and any other model is denied.`
    : `the subagent model list is empty, so spawn_agent is denied until the user adds models in ${SUBAGENT_MODELS_SETTINGS_HINT}.`;
  return `${hint}SKS OpenRouter Only mode: ${list}`;
}
