import { consultJevTurnModel } from '../decisions/integration.js';
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

/** Naruto child spawn: Jev picks the sealed model. An open parent thread is not rerouted. */
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
  if (!decision?.model || !decision.effort) return null;
  if (input.model === decision.model && input.reasoning_effort === decision.effort) return null;
  return {
    ...input,
    model: decision.model,
    reasoning_effort: decision.effort
  };
}
