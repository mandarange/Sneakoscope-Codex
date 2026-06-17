// @ts-nocheck
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js';

const tx = readText('src/core/doctor/doctor-transaction.ts');
const cmd = readText('src/commands/doctor.ts');
assertGate(tx.includes('isDoctorPhaseClean') && tx.includes('markDoctorPhaseClean'), 'doctor transaction must skip clean phases and mark successful phases clean');
assertGate(cmd.includes('doctorDirtyPlan') && cmd.includes('planDoctorDirtyRepair'), 'doctor command must wire dirty planner');
emitGate('doctor:dirty-repair');
