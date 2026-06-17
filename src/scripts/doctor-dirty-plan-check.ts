// @ts-nocheck
import { assertGate, emitGate, makeTempRoot } from './sks-3-1-8-check-lib.js';
import { importDist } from './sks-1-18-gate-lib.js';

const tmp = await makeTempRoot('doctor-dirty-plan-');
const mod = await importDist('core/doctor/doctor-dirty-planner.js');
const plan = mod.planDoctorDirtyRepair(tmp, ['setup', 'context7_repair']);
assertGate(plan.schema === 'sks.doctor-dirty-plan.v1' && plan.dirty_count === 2, 'dirty planner must mark missing markers dirty', plan);
emitGate('doctor:dirty-plan', { dirty: plan.dirty_count });
