// @ts-nocheck
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js';

const mod = await importDist('core/daemon/sksd-client.js');
const state = mod.runSksdClient(root, 'status');
assertGate(state.schema === 'sks.sksd-state.v1', 'sksd status schema mismatch', state);
emitGate('sksd:daemon', { status: state.status });
