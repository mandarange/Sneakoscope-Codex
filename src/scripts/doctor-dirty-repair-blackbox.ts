// @ts-nocheck
import { assertGate, emitGate, makeTempRoot } from './sks-3-1-8-check-lib.js';
import { importDist } from './sks-1-18-gate-lib.js';

const tmp = await makeTempRoot('doctor-dirty-repair-');
const planner = await importDist('core/doctor/doctor-dirty-planner.js');
const tx = await importDist('core/doctor/doctor-transaction.js');
const proofId = planner.markDoctorPhaseClean(tmp, 'setup');
await tx.writeDoctorFixTransaction({
  root: tmp,
  phases: [],
  proofIdsUsed: [proofId]
});
let ran = false;
const report = await tx.runDoctorFixTransaction({
  root: tmp,
  reportPath: null,
  dirtyPlan: planner.planDoctorDirtyRepair(tmp, ['setup']),
  phases: [{ id: 'setup', run: async () => { ran = true; return { id: 'setup', ok: true }; } }]
});
assertGate(
  ran === false && report.ok === true && report.phases[0].warnings.some((warning: string) => warning.startsWith('dirty_plan_skipped_clean_phase')),
  'dirty repair must skip clean phase',
  { ran, report }
);
emitGate('doctor:dirty-repair-blackbox', { skipped: true });
