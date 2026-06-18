import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js';

const impactMod = await importDist('core/triwiki/triwiki-gate-impact-map.js');
const map = impactMod.buildTriWikiGateImpactMap(root);
const report = {
  missing_script: map.orphan_count,
  package_script_orphan: map.package_script_orphan_count,
  release_gate_orphans: map.impacts.filter((impact: { orphan: boolean }) => impact.orphan).map((impact: { gate_id: string }) => impact.gate_id),
  package_script_orphans: map.package_script_orphans || []
};
assertGate(map.orphan_count === 0, 'release gates without package scripts must fail', report);
emitGate('orphan:strong-detection', report);
