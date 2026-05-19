import { normalizeProofRoute, routeRequiresCompletionProof, routeRequiresImageVoxelAnchors } from './route-proof-policy.js';

export function routeFinalizerPolicy(route: any, opts: any = {}) {
  const normalized = normalizeProofRoute(route);
  const visual = routeRequiresImageVoxelAnchors(normalized, opts);
  return {
    route: normalized,
    requires_completion_proof: routeRequiresCompletionProof(normalized),
    requires_image_voxel_anchors: visual,
    requires_before_after_relation: Boolean(opts.fixClaim || opts.requireRelation || opts.beforeAfterClaim),
    strict: Boolean(opts.strict)
  };
}
