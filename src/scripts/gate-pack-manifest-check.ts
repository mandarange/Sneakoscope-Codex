// @ts-nocheck
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js';

const mod = await importDist('core/release/gate-pack-manifest.js');
const manifest = mod.buildGatePackManifest(root);
const ids = manifest.packs.map((pack) => pack.id);
for (const id of mod.REQUIRED_GATE_PACK_IDS) assertGate(ids.includes(id), `gate pack missing: ${id}`, ids);
emitGate('gate-pack:manifest', { packs: ids });
