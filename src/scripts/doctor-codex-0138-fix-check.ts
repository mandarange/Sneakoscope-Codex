#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'
const doctor = readText('src/commands/doctor.ts')
const matrix = readText('src/core/doctor/doctor-readiness-matrix.ts')
assertGate(doctor.includes('runCodex0138Doctor(root, { fix: doctorFix })') && doctor.includes('Codex 0.138 features:'), 'doctor --fix must integrate Codex 0.138 doctor and human-readable feature output')
assertGate(doctor.includes('writeCodexPluginInventoryArtifacts') && doctor.includes('Remote MCP servers:'), 'doctor must surface Codex plugin inventory and remote MCP candidates')
assertGate(matrix.includes('codex_0138_doctor') && matrix.includes('codex_plugin_app_template_policy'), 'readiness matrix must carry 0.138 doctor/plugin warnings')
emitGate('doctor:codex-0138-fix')
