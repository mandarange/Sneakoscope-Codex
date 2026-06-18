// @ts-nocheck
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js';

const mod = await importDist('core/daemon/sksd-client.js');
const state = mod.runSksdClient(root, 'status');
const start = mod.runSksdClient(root, 'start');
assertGate(state.schema === 'sks.sksd-state.v1', 'sksd status schema mismatch', state);
assertGate(start.protocol_ok === true && start.status === 'running', 'sksd start must record protocol-ready state', start);
emitGate('sksd:daemon', { status: start.status });
