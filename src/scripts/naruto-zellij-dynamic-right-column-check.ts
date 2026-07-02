#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.js'

const requireReal = process.argv.includes('--require-real') || process.env.SKS_REQUIRE_ZELLIJ === '1'
const naruto = fs.readFileSync(path.join(root, 'src/core/commands/naruto-command.ts'), 'utf8')
const worker = fs.readFileSync(path.join(root, 'src/core/zellij/zellij-worker-pane-manager.ts'), 'utf8')
const swarm = fs.readFileSync(path.join(root, 'src/core/agents/native-cli-session-swarm.ts'), 'utf8')
const realGeometryProof = requireReal ? runRealGeometryProof() : null
const report = {
  schema: 'sks.naruto-zellij-monitor-plus-viewports-check.v1',
  ok: true,
  require_real: requireReal,
  initial_main_only: /slotCount:\s*0/.test(naruto),
  passes_session_name: naruto.includes('zellijSessionName: liveZellij?.session_name'),
  passes_worker_placement: naruto.includes("workerPlacement: parsed.json || parsed.noOpenZellij ? 'process' : 'zellij-pane'"),
  passes_viewport_ui: worker.includes("'headless_by_design_viewport_ui'") && swarm.includes('openHeadlessByDesignViewportWorker(paneInput)'),
  legacy_escape_hatch: swarm.includes("SKS_ZELLIJ_LEGACY_WORKER_PANES === '1'") && swarm.includes('openWorkerPane(paneInput)'),
  real_geometry_proof: realGeometryProof
}
report.ok = report.initial_main_only
  && report.passes_session_name
  && report.passes_worker_placement
  && report.passes_viewport_ui
  && report.legacy_escape_hatch
  && (!requireReal || realGeometryProof?.ok === true)
assertGate(report.ok, 'Naruto must use monitor plus fixed viewports with headless workers by default', report)
emitGate('naruto:zellij-monitor-plus-viewports', report)

function runRealGeometryProof() {
  const res = spawnSync('npm', ['run', 'zellij:right-column-real-geometry', '--silent', '--', '--require-real'], {
    cwd: root,
    env: { ...process.env, SKS_REQUIRE_ZELLIJ: '1' },
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  })
  return {
    ok: res.status === 0,
    exit_code: res.status,
    stdout_tail: tail(res.stdout),
    stderr_tail: tail(res.stderr)
  }
}

function tail(text) {
  return String(text || '').split('\n').slice(-30).join('\n')
}
