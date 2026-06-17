// @ts-nocheck
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js';

const mod = await importDist('core/triwiki/triwiki-gate-impact-map.js');
const map = mod.buildTriWikiGateImpactMap(root);
assertGate(map.schema === 'sks.triwiki-gate-impact-map.v1' && map.gate_count > 0, 'impact map must index release gates', map);
assertGate(map.impacts.some((impact) => impact.gate_pack === 'triwiki'), 'impact map must include triwiki pack', map.impacts.slice(0, 10));
emitGate('triwiki:gate-impact-map', { gates: map.gate_count, orphans: map.orphan_count });
