// @ts-nocheck
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js';

const mod = await importDist('core/release/gate-pack-runner.js');
const report = mod.runGatePack({ root, packId: 'triwiki', execute: false });
assertGate(report.schema === 'sks.gate-pack-runner.v1' && report.mode === 'plan' && report.ok === true, 'gate pack runner plan must pass', report);
emitGate('gate-pack:runner', { pack: report.pack_id, reused: report.reused, executed: report.executed });
