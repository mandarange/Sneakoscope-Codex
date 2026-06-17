#!/usr/bin/env node
import { assertGate, emitGate, makeTempRoot } from './sks-3-1-8-check-lib.js';
import { runDoctorFixTransaction } from '../core/doctor/doctor-transaction.js';
import { doctorRepairPostcheck } from '../core/doctor/doctor-repair-postcheck.js';

const root = await makeTempRoot('sks-doctor-tx-blackbox-');
const tx = await runDoctorFixTransaction({
  root,
  phases: [
    { id: 'preflight', run: async () => ({ id: 'preflight', ok: true, artifact_path: `${root}/preflight.json` }) },
    {
      id: 'postchecked',
      run: async () => ({ id: 'postchecked', ok: true }),
      postcheck: async () => ({ ok: true, warnings: ['postcheck_executed'] })
    },
    {
      id: 'optional_operator',
      required_for_ready: false,
      run: async () => ({ id: 'optional_operator', ok: false, manual_required: true, required_for_ready: false, blockers: ['operator_action_required'] })
    }
  ],
  reportPath: null
});
const postcheck = doctorRepairPostcheck(tx);
assertGate(tx.ok === true && postcheck.ok === true, 'doctor transaction blackbox must allow optional manual follow-up without blocking readiness', { tx, postcheck });
assertGate(tx.phases.some((phase) => phase.warnings.includes('postcheck_executed')), 'doctor transaction blackbox must run phase postchecks', tx);
assertGate(tx.raw_secret_values_recorded === false, 'doctor transaction blackbox must not record raw secrets', tx);
emitGate('doctor:transaction-engine-blackbox', { phases: tx.phases.length });
