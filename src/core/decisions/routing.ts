import { effortForTier, latestTierModelSet, resolveLatestModelTiers } from '../subagents/model-tiers.js';
import {
  routingTier,
  type RoutingCandidate,
  type RoutingRoleCandidate,
  type RoutingTierId,
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
  const current = latestTierModelSet();
  for (const [name, effort] of Object.entries(selected.efforts)) {
    const model = selected.models[name];
    if (!model || !current.has(model)) continue;
    const row = next[name];
    if (!row || row.routing_dynamic !== true || row.routed_model_policy === 'user_role_model_preference') continue;
    next[name] = {
      ...row,
      routed_model: model,
      routed_model_reasoning_effort: effort,
      routed_model_policy: 'jev_sealed_routing',
      jev_routing_lane: selected.id
    };
  }
  return next;
}

/**
 * Turn Jev's per-role tiers into concrete models: each tier resolves to the
 * newest model Codex lists for it at the tier's effort.
 */
export function assembleRoutingSelection(
  effects: readonly { roleId: string; tier: RoutingTierId }[]
): RoutingCandidate | null {
  const resolved = resolveLatestModelTiers();
  const models: Record<string, string> = {};
  const efforts: Record<string, SealedRoutingEffort> = {};
  const tiers: Record<string, RoutingTierId> = {};
  for (const effect of effects) {
    const tier = routingTier(effect.tier);
    if (!tier || !ROLE_ID.test(effect.roleId)) continue;
    models[effect.roleId] = resolved.models[tier.id];
    efforts[effect.roleId] = effortForTier(tier.id, resolved);
    tiers[effect.roleId] = tier.id;
  }
  if (Object.keys(models).length === 0) return null;
  return {
    id: 'jev_role_fanout',
    summary: 'Jev chose a tier for each dynamic Naruto role; each tier is its newest model.',
    models,
    efforts,
    tiers
  };
}
