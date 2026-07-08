#!/usr/bin/env node
import { runNarutoWriteE2e, type NarutoWriteE2eMode } from '../core/naruto/naruto-write-e2e.js'

const mode = readMode(process.argv.slice(2))
const report = await runNarutoWriteE2e(mode)
console.log(JSON.stringify(report, null, 2))
if (!report.ok) process.exit(1)

function readMode(args: string[]): NarutoWriteE2eMode {
  const index = args.indexOf('--mode')
  const value = index >= 0 ? args[index + 1] : 'hermetic'
  if (value === 'hermetic' || value === 'real-codex') return value
  console.error(JSON.stringify({
    ok: false,
    status: 'blocked',
    blockers: [`invalid_mode:${String(value || '')}`]
  }, null, 2))
  process.exit(1)
}
