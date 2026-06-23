#!/usr/bin/env node
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const { buildDoctorReadinessMatrix } = await importDist('core/doctor/doctor-readiness-matrix.js')

const codexDoctor = {
  schema: 'sks.codex-doctor-bridge.v2',
  available: true,
  exit_code: 1,
  process_exit_code: 1,
  disposition: 'warn',
  semantic_ok: true,
  blocking_checks: [],
  warning_checks: [{ issue: 'codex_doctor_install_update_path_mismatch' }],
  blockers: [],
  warnings: ['codex_doctor_install_update_path_mismatch']
}

const matrix = buildDoctorReadinessMatrix({
  codex: { available: true, bin: '/fixture/codex' },
  codex_config: {
    ok: true,
    checks: [
      { name: 'node_read', ok: true },
      { name: 'spawned_node_child_read', ok: true },
      { name: 'actual_codex_cli_config_load', ok: true }
    ]
  },
  codex_doctor: codexDoctor,
  require_codex_doctor: true
})

const report = {
  schema: 'sks.doctor-warning-only-not-blocker-check.v1',
  ready: matrix.ready,
  core_ready: matrix.core_ready,
  primary_blocker: matrix.primary_blocker,
  blockers: matrix.blockers,
  warnings: matrix.warnings
}

assertGate(matrix.ready === true && matrix.primary_blocker === null && matrix.blockers.length === 0, 'warning-only Codex Doctor must not block readiness', report)
emitGate('doctor:warning-only-not-blocker', report)
