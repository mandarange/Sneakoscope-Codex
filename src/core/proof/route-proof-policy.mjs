export const SERIOUS_ROUTE_ALIASES = Object.freeze([
  '$Team',
  '$DFix',
  '$QA-LOOP',
  '$Research',
  '$AutoResearch',
  '$PPT',
  '$Image-UX-Review',
  '$UX-Review',
  '$Visual-Review',
  '$UI-UX-Review',
  '$From-Chat-IMG',
  '$Computer-Use',
  '$CU',
  '$DB',
  '$Wiki',
  '$GX',
  '$Goal',
  '$MAD-SKS',
  'hproof',
  'proof-field',
  'recallpulse'
]);

export const VISUAL_ROUTE_ALIASES = Object.freeze([
  '$Image-UX-Review',
  '$UX-Review',
  '$Visual-Review',
  '$UI-UX-Review',
  '$From-Chat-IMG',
  '$PPT',
  '$QA-LOOP',
  '$Computer-Use',
  '$CU',
  '$GX'
]);

const ROUTE_NORMALIZATION = Object.freeze({
  team: '$Team',
  dfix: '$DFix',
  qaloop: '$QA-LOOP',
  'qa-loop': '$QA-LOOP',
  research: '$Research',
  autoresearch: '$AutoResearch',
  ppt: '$PPT',
  imageuxreview: '$Image-UX-Review',
  'image-ux-review': '$Image-UX-Review',
  uxreview: '$UX-Review',
  'ux-review': '$UX-Review',
  visualreview: '$Visual-Review',
  'visual-review': '$Visual-Review',
  uiuxreview: '$UI-UX-Review',
  'ui-ux-review': '$UI-UX-Review',
  fromchatimg: '$From-Chat-IMG',
  'from-chat-img': '$From-Chat-IMG',
  computeruse: '$Computer-Use',
  'computer-use': '$Computer-Use',
  cu: '$CU',
  db: '$DB',
  wiki: '$Wiki',
  gx: '$GX',
  goal: '$Goal',
  madsks: '$MAD-SKS',
  'mad-sks': '$MAD-SKS',
  hproof: 'hproof',
  prooffield: 'proof-field',
  'proof-field': 'proof-field',
  recallpulse: 'recallpulse'
});

export function normalizeProofRoute(route) {
  const raw = String(route || '').trim();
  if (!raw) return null;
  if (SERIOUS_ROUTE_ALIASES.includes(raw) || VISUAL_ROUTE_ALIASES.includes(raw)) return raw;
  const stripped = raw.replace(/^\$/, '').replace(/[^A-Za-z0-9-]+/g, '').toLowerCase();
  return ROUTE_NORMALIZATION[stripped] || raw;
}

export function routeRequiresCompletionProof(route) {
  const normalized = normalizeProofRoute(route);
  return SERIOUS_ROUTE_ALIASES.includes(normalized);
}

export function routeRequiresImageVoxelAnchors(route, opts = {}) {
  if (opts.visualClaim === true) return true;
  const normalized = normalizeProofRoute(route);
  if (opts.visualClaim === false) return false;
  return VISUAL_ROUTE_ALIASES.includes(normalized);
}

export function routeFromState(state = {}) {
  return normalizeProofRoute(state.route_command || state.route || state.mode || state.route_id || state.id);
}

export function proofStatusBlocks(status) {
  return status === 'failed' || status === 'blocked' || status === 'not_verified';
}
