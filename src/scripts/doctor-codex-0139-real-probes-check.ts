#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import path from 'node:path'
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.js'

const real = readJson('.sneakoscope/codex-0139-real-probes.json')
const summary = readJson('.sneakoscope/codex-0139-real-probe-summary.json')
const doctorSource = fs.readFileSync(path.join(root, 'src/core/doctor/codex-0139-doctor.ts'), 'utf8')
const readinessSource = fs.readFileSync(path.join(root, 'src/core/doctor/doctor-readiness-matrix.ts'), 'utf8')
assertGate(doctorSource.includes('npm run codex:0139-real-probes:require-real'), 'doctor Codex 0.139 guidance must mention strict real probe command')
assertGate(readinessSource.includes('codex_0139_real_probes'), 'doctor readiness matrix must surface Codex 0.139 real probes')
emitGate('doctor:codex-0139-real-probes', {
  real_probe_artifact_present: Boolean(real),
  summary_artifact_present: Boolean(summary),
  skipped: real?.skipped || summary?.skipped_count || []
})

function readJson(rel) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))
  } catch {
    return null
  }
}
