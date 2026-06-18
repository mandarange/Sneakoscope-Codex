import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js';

const mod = await importDist('core/doctor/doctor-dirty-planner.js');
const plan = mod.planDoctorDirtyRepair(root, ['context7-mcp']);
const phase = plan.phases[0];
assertGate(Boolean(phase.input_hash) && phase.postcheck_required === true, 'dirty planner must use semantic hash and postcheck requirement', phase);
emitGate('doctor:dirty-semantic', { status: phase.status, reason: phase.reason, input_hash: phase.input_hash });
