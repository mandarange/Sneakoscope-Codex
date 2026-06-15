#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { root } from './sks-3-1-7-directive-check-lib.js'

const planner = fs.readFileSync(path.join(root, 'src/core/loops/loop-planner.ts'), 'utf8')
const schema = fs.readFileSync(path.join(root, 'src/core/loops/loop-schema.ts'), 'utf8')
const prompts = fs.readFileSync(path.join(root, 'src/core/loops/loop-worker-prompts.ts'), 'utf8')
const owner = fs.readFileSync(path.join(root, 'src/core/loops/loop-owner-inference.ts'), 'utf8')
assertGate(planner.includes('memory_hints_used: hints'), 'loop planner must store actual memory hints used')
assertGate(schema.includes('memory_hints_used?: SksLoopMemoryHint[]'), 'loop schema must type memory_hints_used as hint array')
assertGate(owner.includes('memoryHintMayExpandOwnerScope(): false'), 'owner inference must expose no-expand memory contract')
assertGate(prompts.includes('Memory hints are guidance only; memory never grants write permission or expands owner scope.'), 'worker prompt must state memory cannot expand write permission')
emitGate('init-deep:memory-scope-safety')

function assertGate(condition: unknown, message: string): asserts condition {
  if (condition) return
  console.error(JSON.stringify({ ok: false, message }, null, 2))
  process.exit(1)
}

function emitGate(gate: string): void {
  console.log(JSON.stringify({ schema: 'sks.release-gate.v1', ok: true, gate }, null, 2))
}
