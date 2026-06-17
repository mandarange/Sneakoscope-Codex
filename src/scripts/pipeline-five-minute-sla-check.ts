// @ts-nocheck
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js';

const mod = await importDist('core/release/sla-scheduler.js');
const plan = mod.planFiveMinuteSla(root);
assertGate(plan.schema === 'sks.sla-scheduler.v1' && plan.certificate.sla_ms === 300000, 'five-minute SLA plan malformed', plan);
emitGate('pipeline:five-minute-sla', { ok: plan.ok, gates: plan.graph.gates.length, blockers: plan.certificate.blockers });
