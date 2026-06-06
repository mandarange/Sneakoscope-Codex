#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

const command = process.argv.slice(2).join(' ')
if (!command) {
  console.error('usage: release-gate-worker <command>')
  process.exit(2)
}
const result = spawnSync(command, { shell: true, stdio: 'inherit', env: process.env })
process.exit(result.status ?? 1)
