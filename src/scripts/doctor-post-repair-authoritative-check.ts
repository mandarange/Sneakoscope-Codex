#!/usr/bin/env node
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const { buildDoctorReadinessMatrix } = await importDist('core/doctor/doctor-readiness-matrix.js')

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
  pre_repair_codex_doctor: {
    disposition: 'block',
    blockers: ['codex_doctor_config_parse_failed']
  },
  post_repair_codex_doctor: {
    disposition: 'pass',
    blockers: [],
    warnings: []
  },
  codex_doctor: {
    disposition: 'pass',
    blockers: [],
    warnings: []
  },
  context7_mcp_repair: { ok: true, blockers: [] },
  doctor_fix_postcheck: { ok: true, blockers: [] }
})

const report = {
  schema: 'sks.doctor-post-repair-authoritative-check.v1',
  ready: matrix.ready,
  authoritative_probe: matrix.repair_readiness?.authoritative_probe,
  blockers: matrix.blockers
}

assertGate(matrix.ready === true && matrix.repair_readiness?.authoritative_probe === 'post_repair_codex_doctor', 'readiness must use post-repair Codex Doctor as authoritative probe', report)
emitGate('doctor:post-repair-authoritative', report)
