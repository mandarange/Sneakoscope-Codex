import {
  sealedRoutingModel,
  type RoutingCandidate,
  type RoutingRoleCandidate,
  type SealedRoutingEffort
} from './types.js';

export interface RoutingRoleInput {
  name: string;
  dynamic: boolean;
  summary: string;
}

const ROLE_ID = /^[a-z][a-z0-9_]{0,40}$/;
/** One Choice plus a speculative difficulty Score and risk Noul, inside the 32-question cap. */
export const MAX_JEV_ROUTING_ROLES = 8;

/**
 * Dynamic Naruto roles Jev may route. The model is not chosen here.
 * One Decisions request asks a Choice per role, with difficulty and risk in the same call.
 */
export function buildRoutingCandidates(input: {
  roles: readonly RoutingRoleInput[];
}): RoutingRoleCandidate[] {
  const out: RoutingRoleCandidate[] = [];
  const seen = new Set<string>();
  for (const role of input.roles) {
    const name = role.name.trim();
    if (!role.dynamic || !ROLE_ID.test(name) || seen.has(name)) continue;
    seen.add(name);
    out.push({ id: name, summary: role.summary.trim().slice(0, 240) });
    if (out.length >= MAX_JEV_ROUTING_ROLES) break;
  }
  return out;
}

export function applySealedRouting(
  agents: Record<string, any> | null | undefined,
  selected: RoutingCandidate | null
): Record<string, any> {
  if (!selected || !agents) return { ...(agents || {}) };
  const next: Record<string, any> = { ...agents };
  for (const [name, effort] of Object.entries(selected.efforts)) {
    const model = selected.models[name];
    const sealed = model ? sealedRoutingModel(model) : null;
    if (!sealed || sealed.effort !== effort) continue;
    const row = next[name];
    if (!row || row.routing_dynamic !== true || row.routed_model_policy === 'user_role_model_preference') continue;
    next[name] = {
      ...row,
      routed_model: sealed.id,
      routed_model_reasoning_effort: effort,
      routed_model_policy: 'jev_sealed_routing',
      jev_routing_lane: selected.id
    };
  }
  return next;
}

export function assembleRoutingSelection(
  effects: readonly { roleId: string; model: string }[]
): RoutingCandidate | null {
  const models: Record<string, string> = {};
  const efforts: Record<string, SealedRoutingEffort> = {};
  for (const effect of effects) {
    const sealed = sealedRoutingModel(effect.model);
    if (!sealed || !ROLE_ID.test(effect.roleId)) continue;
    models[effect.roleId] = sealed.id;
    efforts[effect.roleId] = sealed.effort;
  }
  if (Object.keys(models).length === 0) return null;
  return {
    id: 'jev_role_fanout',
    summary: 'Jev chose a sealed model for each dynamic Naruto role.',
    models,
    efforts
  };
}
