#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'
import { narutoCommand } from '../core/commands/naruto-command.js'

const summary = await narutoCommand([
  'run',
  'Naruto orchestrator runtime source artifact check',
  '--json',
  '--backend',
  'fake',
  '--agents',
  '2',
  '--work-items',
  '2',
  '--readonly',
  '--no-open-zellij'
])
const ledgerRoot = path.join(process.cwd(), '.sneakoscope', 'missions', summary.mission_id || '', 'agents')
const realPool = readJson(path.join(ledgerRoot, 'naruto-real-active-pool.json'))
const wiring = readJson(path.join(ledgerRoot, 'naruto-runtime-wiring.json'))
const artifactText = collectText(ledgerRoot)
const ok = summary.runtime_source_of_truth === 'agent-orchestrator-scheduler'
  && summary.pre_run_real_active_pool_source === 'skipped'
  && realPool?.status === 'skipped'
  && realPool?.runtime_source_of_truth === 'agent-orchestrator-scheduler'
  && realPool?.reason === 'pre_run_smoke_disabled_for_production'
  && wiring?.source_of_truth === 'naruto-work-graph'
  && artifactText.includes('agent-orchestrator-scheduler')
  && artifactText.includes('pre_run_smoke_never_owns_production_runtime')

assertGate(ok, 'Naruto production runtime source of truth must be proven by command artifacts, not source-string checks', {
  summary,
  realPool,
  wiring
})
emitGate('naruto:orchestrator-runtime-source', {
  mission_id: summary.mission_id,
  runtime_source_of_truth: summary.runtime_source_of_truth,
  pre_run_real_active_pool_source: summary.pre_run_real_active_pool_source,
  real_pool_status: realPool?.status || null,
  wiring_ok: wiring?.ok === true
})

function readJson(file: string) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function collectText(root: string) {
  const chunks: string[] = []
  const stack = [root]
  while (stack.length) {
    const current = stack.pop()
    if (!current || !fs.existsSync(current)) continue
    const stat = fs.statSync(current)
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(current)) stack.push(path.join(current, child))
      continue
    }
    if (!/\.(json|jsonl)$/.test(current)) continue
    chunks.push(fs.readFileSync(current, 'utf8'))
  }
  return chunks.join('\n')
}
