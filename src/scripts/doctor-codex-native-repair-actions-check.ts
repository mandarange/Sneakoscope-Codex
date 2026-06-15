#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { root } from './sks-3-1-7-directive-check-lib.js'

const source = fs.readFileSync(path.join(root, 'src/commands/doctor.ts'), 'utf8')
for (const token of [
  'Repair actions:',
  'Zellij: sks doctor --fix --yes',
  'Homebrew + Zellij: sks doctor --fix --install-homebrew --yes',
  'Codex Native managed assets: sks doctor --fix --repair-codex-native --yes',
  'Project memory: sks codex-native init-deep --apply --directory-local'
]) assertGate(source.includes(token), `doctor repair action missing:${token}`)
emitGate('doctor:codex-native-repair-actions')

function assertGate(condition: unknown, message: string): asserts condition {
  if (condition) return
  console.error(JSON.stringify({ ok: false, message }, null, 2))
  process.exit(1)
}

function emitGate(gate: string): void {
  console.log(JSON.stringify({ schema: 'sks.release-gate.v1', ok: true, gate }, null, 2))
}
