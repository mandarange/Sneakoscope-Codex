// @ts-nocheck
import { assertGate, emitGate, makeTempRoot } from './sks-3-1-8-check-lib.js';
import { importDist } from './sks-1-18-gate-lib.js';

const tmp = await makeTempRoot('sksd-warm-');
const mod = await importDist('core/daemon/sksd-client.js');
const warm = mod.runSksdClient(tmp, 'warm');
const status = mod.runSksdClient(tmp, 'status');
assertGate(warm.status === 'warm' && status.status === 'warm' && status.proof_bank_ready === true, 'sksd warm cache must persist state', { warm, status });
emitGate('sksd:warm-cache-blackbox', { status: status.status });
