#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { syncCodexSksSkills } from '../core/codex-app/codex-skill-sync.js'

const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sks-skill-content-'))
const skillsRoot = path.join(root, 'skills')
const report = await syncCodexSksSkills({ root, skillsRoot, apply: true })
const skill = await fs.promises.readFile(path.join(skillsRoot, 'sks-loop', 'SKILL.md'), 'utf8')
for (const token of ['Purpose:', 'Route:', 'Command:', 'Safety rules:', 'Proof paths:', 'Failure recovery:']) assertGate(skill.includes(token), `managed skill missing:${token}`)
assertGate(report.interop.clobbered_user_skills === false, 'skill sync clobbered user skills')
assertGate(Array.isArray(report.interop.skipped_user_skills) && Array.isArray(report.interop.managed_skills), 'skill sync interop no-clobber report incomplete')
emitGate('codex-native:skill-content')

function assertGate(condition: unknown, message: string): asserts condition {
  if (condition) return
  console.error(JSON.stringify({ ok: false, message }, null, 2))
  process.exit(1)
}

function emitGate(gate: string): void {
  console.log(JSON.stringify({ schema: 'sks.release-gate.v1', ok: true, gate }, null, 2))
}
