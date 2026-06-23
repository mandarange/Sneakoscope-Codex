#!/usr/bin/env node
import fs from 'node:fs'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'

const text = fs.readFileSync('src/commands/doctor.ts', 'utf8')
const report = {
  schema: 'sks.doctor-plain-fix-native-assets-check.v1',
  plain_fix_repairs_native: /const repairCodexNative = doctorFix;/.test(text),
  deprecated_flag_only_not_required: !/doctorFix && flag\(args, '--repair-codex-native'\)/.test(text)
}

assertGate(report.plain_fix_repairs_native && report.deprecated_flag_only_not_required, 'plain sks doctor --fix must repair safe Codex Native managed assets without extra flag', report)
emitGate('doctor:plain-fix-native-assets', report)
