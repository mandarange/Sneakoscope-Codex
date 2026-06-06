#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { buildZellijDashboardSnapshot, renderZellijDashboardText } from '../core/zellij/zellij-dashboard-renderer.js'

const args = process.argv.slice(2)
const snapshotPath = path.resolve(String(readOption(args, '--snapshot', '') || ''))
const intervalMs = Math.max(250, Number(readOption(args, '--interval-ms', '1000')) || 1000)
const once = args.includes('--once')

if (!snapshotPath) {
  console.error('Usage: zellij-dashboard-watch --snapshot <path> [--interval-ms 1000] [--once]')
  process.exit(2)
}

render()
if (!once) setInterval(render, intervalMs)

function render() {
  const snapshot = readSnapshot(snapshotPath)
  const text = renderZellijDashboardText(snapshot)
  process.stdout.write(`\x1b[2J\x1b[H${text}\nUpdated: ${new Date().toISOString()}\n`)
}

function readSnapshot(file: string) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    return buildZellijDashboardSnapshot(parsed)
  } catch (err: any) {
    return buildZellijDashboardSnapshot({
      mission_id: path.basename(path.dirname(file)) || 'unknown',
      mode: 'dashboard-watch',
      latest_blockers: [`snapshot_read_failed:${err?.code || err?.message || String(err)}`]
    })
  }
}

function readOption(list: string[], name: string, fallback: string) {
  const index = list.indexOf(name)
  if (index >= 0 && list[index + 1]) return list[index + 1]
  const prefixed = list.find((arg) => arg.startsWith(`${name}=`))
  return prefixed ? prefixed.slice(name.length + 1) : fallback
}
