#!/usr/bin/env node
import { assertGate, emitGate, makeTempRoot } from './sks-3-1-8-check-lib.js';
import { runDoctorFixTransaction } from '../core/doctor/doctor-transaction.js';
import { doctorRepairPostcheck } from '../core/doctor/doctor-repair-postcheck.js';

const root = await makeTempRoot('sks-doctor-tx-');
let rollbackCalled = false;
const tx = await runDoctorFixTransaction({
  root,
  phases: [
    { id: 'preflight', run: async () => ({ id: 'preflight', ok: true }) },
    {
      id: 'optional_manual',
      required_for_ready: false,
      run: async () => ({ id: 'optional_manual', ok: false, manual_required: true, required_for_ready: false, blockers: ['operator_action_required'] })
    },
    {
      id: 'rolled_back',
      run: async () => ({ id: 'rolled_back', ok: false, blockers: ['fixture_failure'] }),
      rollback: async () => {
        rollbackCalled = true;
      }
    }
  ],
  reportPath: null
});

const postcheck = doctorRepairPostcheck(tx);
assertGate(rollbackCalled && tx.rollback_performed === true, 'doctor transaction runner must execute rollback hooks for failed phases', tx);
assertGate(tx.ok === false && postcheck.ok === false, 'required failed phase must block readiness', { tx, postcheck });
assertGate(tx.phases.find((phase) => phase.id === 'optional_manual')?.required_for_ready === false, 'optional manual phase must be explicitly marked', tx);
emitGate('doctor:transaction-engine', { phases: tx.phases.length });
