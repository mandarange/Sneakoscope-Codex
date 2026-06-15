#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { root } from './sks-3-1-7-directive-check-lib.js'

const source = fs.readFileSync(path.join(root, 'src/commands/doctor.ts'), 'utf8')
for (const token of [
  'SKS Runtime Readiness:',
  'Zellij:',
  'Codex Native:',
  'Loop Mesh:',
  'QA Visual:',
  'Research Sources:',
  'Image Follow-up:',
  'hook-derived evidence will not count',
  'message-role fallback active',
  'MAD can run with --headless; live panes require repair'
]) assertGate(source.includes(token), `doctor readiness token missing:${token}`)
emitGate('doctor:codex-native-readiness-ux')

function assertGate(condition: unknown, message: string): asserts condition {
  if (condition) return
  console.error(JSON.stringify({ ok: false, message }, null, 2))
  process.exit(1)
}

function emitGate(gate: string): void {
  console.log(JSON.stringify({ schema: 'sks.release-gate.v1', ok: true, gate }, null, 2))
}
