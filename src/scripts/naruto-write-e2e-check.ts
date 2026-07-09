#!/usr/bin/env node
import { runNarutoWriteE2e, type NarutoWriteE2eMode } from '../core/naruto/naruto-write-e2e.js'
import fs from 'node:fs/promises'
import path from 'node:path'

const mode = readMode(process.argv.slice(2))
const report = await runNarutoWriteE2e(mode)
await writeReport(mode, report)
console.log(JSON.stringify(report, null, 2))
if (!report.ok) process.exit(1)

async function writeReport(mode: NarutoWriteE2eMode, report: unknown): Promise<void> {
  const root = process.cwd()
  const dir = path.join(root, '.sneakoscope', 'reports')
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'naruto-write-e2e.json'), `${JSON.stringify(report, null, 2)}\n`)
  if (mode === 'real-codex') {
    await fs.writeFile(path.join(dir, 'naruto-real-write-e2e.json'), `${JSON.stringify(report, null, 2)}\n`)
  }
}

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
