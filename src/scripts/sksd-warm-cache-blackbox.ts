// @ts-nocheck
import { assertGate, emitGate, makeTempRoot } from './sks-3-1-8-check-lib.js';
import { importDist } from './sks-1-18-gate-lib.js';

const tmp = await makeTempRoot('sksd-warm-');
const mod = await importDist('core/daemon/sksd-client.js');
const warm = mod.runSksdClient(tmp, 'warm');
const status = mod.runSksdClient(tmp, 'status');
const proofBank = mod.handleSksdRequest(tmp, { type: 'proof-bank-status', root: tmp });
assertGate(warm.status === 'warm' && status.status === 'warm' && status.proof_bank_ready === true && status.protocol_ok === true, 'sksd warm cache must persist protocol state', { warm, status });
assertGate(proofBank.schema === 'sks.triwiki-proof-bank.v1', 'sksd proof-bank-status request must roundtrip', proofBank);
emitGate('sksd:warm-cache-blackbox', { status: status.status });
