#!/usr/bin/env node
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const { writeDoctorFixTransaction } = await importDist('core/doctor/doctor-transaction.js')

const report = await writeDoctorFixTransaction({
  root: process.cwd(),
  reportPath: null,
  phases: [
    { id: 'managed_write_with_rollback', ok: true, repaired: true, required_for_ready: true, rollback_evidence: 'byte-for-byte-backup' },
    { id: 'clean_skip', ok: true, repaired: false, required_for_ready: true, rollback_evidence: 'clean_phase_no_mutation' }
  ]
})

assertGate(report.schema === 'sks.doctor-fix-transaction.v2' && report.ok === true && report.mutations_without_rollback === 0, 'doctor transaction must record rollback evidence for required mutations', report)
emitGate('doctor:transaction-owns-mutations', report)
