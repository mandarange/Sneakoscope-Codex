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
  require_codex_doctor: true,
  doctor_native_capability: {
    ok: true,
    blockers: [],
    optional_warnings: ['computer_use_manual_required', 'chrome_extension_manual_required'],
    native_capabilities: {
      capabilities: [
        { id: 'computer_use', availability: 'manual-required', repairability: 'manual-required', after: 'unknown' },
        { id: 'chrome_web_review', availability: 'manual-required', repairability: 'manual-required', after: 'unknown' }
      ],
      route_blockers: {
        'route-computer-use': ['computer_use_os_permission_or_capability_unknown'],
        'route-chrome-web-review': ['codex_chrome_extension_readiness_not_verified']
      }
    }
  }
})

const report = {
  schema: 'sks.doctor-warning-only-not-blocker-check.v1',
  ready: matrix.ready,
  core_ready: matrix.core_ready,
  primary_blocker: matrix.primary_blocker,
  optional_capabilities: matrix.optional_capabilities,
  blockers: matrix.blockers,
  warnings: matrix.warnings
}

assertGate(matrix.ready === true && matrix.primary_blocker === null && matrix.blockers.length === 0, 'warning-only Codex Doctor must not block readiness', report)
assertGate(matrix.optional_capabilities.computer_use === 'manual_required' && matrix.optional_capabilities.chrome_web_review === 'manual_required', 'optional native capabilities must remain route-gated warnings', report)
emitGate('doctor:warning-only-not-blocker', report)
