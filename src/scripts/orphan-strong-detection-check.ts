import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js';

const impactMod = await importDist('core/triwiki/triwiki-gate-impact-map.js');
const map = impactMod.buildTriWikiGateImpactMap(root);
assertGate(map.orphan_count === 0, 'release gates without package scripts must fail', { orphan_count: map.orphan_count, orphans: map.impacts.filter((impact: { orphan: boolean }) => impact.orphan).map((impact: { gate_id: string }) => impact.gate_id) });
emitGate('orphan:strong-detection', { missing_script: map.orphan_count, package_script_orphan: map.package_script_orphan_count });
