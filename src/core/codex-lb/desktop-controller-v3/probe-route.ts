import { compareModelVersions, parseGptModelId } from '../../subagents/model-tiers.js';
import type { BridgeProviderId, BridgeRouteTarget } from '../bridge-contracts.js';

// Same version, different family: the balanced model is the everyday one.
const FAMILY_ORDER = ['sol', 'astra', 'luna', 'terra'];

function familyRank(family: string): number {
  const index = FAMILY_ORDER.indexOf(family);
  return index === -1 ? FAMILY_ORDER.length : index;
}

/**
 * The route a live probe exercises for `providerId`. Route policies list models
 * alphabetically, so "the first route" is whichever id sorts first (a hidden
 * reviewer model or the oldest generation), not a model anyone uses. The probe
 * sends a real request, so it takes the newest `gpt-<version>-<family>` route
 * the provider serves, the model Codex Desktop would actually pick, and falls
 * back to the provider's first route for providers without such ids. The
 * liveness probe and the route-proof probe must agree, so both call this.
 */
export function probeRouteForProvider(
  policy: { readonly model_routes: Record<string, BridgeRouteTarget> } | null | undefined,
  providerId: BridgeProviderId
): [string, BridgeRouteTarget] | null {
  if (!policy) return null;
  const routes = Object.entries(policy.model_routes).filter(([, target]) => target.provider_id === providerId);
  let best: { entry: [string, BridgeRouteTarget]; version: number[]; family: string } | null = null;
  for (const entry of routes) {
    const id = parseGptModelId(entry[0]);
    if (!id) continue;
    if (!best
      || compareModelVersions(id.version, best.version) > 0
      || (compareModelVersions(id.version, best.version) === 0 && familyRank(id.family) < familyRank(best.family))) {
      best = { entry, version: id.version, family: id.family };
    }
  }
  return best?.entry ?? routes[0] ?? null;
}
