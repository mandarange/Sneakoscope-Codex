import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js';

const impactMod = await importDist('core/triwiki/triwiki-gate-impact-map.js');
const map = impactMod.buildTriWikiGateImpactMap(root);
const legacyOrphans = map.impacts.filter((impact: { orphan: boolean; gate_id: string }) => impact.orphan && /tmux|team|legacy|codex:013/.test(impact.gate_id));
assertGate(legacyOrphans.length === 0, 'removable legacy gates must not remain orphaned in release surface', legacyOrphans);
emitGate('legacy:strong-inventory', { legacy_orphans: legacyOrphans.length });
