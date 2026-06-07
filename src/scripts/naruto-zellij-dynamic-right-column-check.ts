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
  schema: 'sks.naruto-zellij-dynamic-right-column-check.v1',
  ok: true,
  require_real: requireReal,
  initial_main_only: /slotCount:\s*0/.test(naruto),
  passes_session_name: naruto.includes('zellijSessionName: liveZellij?.session_name'),
  passes_worker_placement: naruto.includes("workerPlacement: parsed.json || parsed.noOpenZellij ? 'process' : 'zellij-pane'"),
  passes_visible_cap: naruto.includes('zellijVisiblePaneCap: zellijVisiblePanes'),
  worker_uses_right_column: worker.includes("rightColumnMode: 'spawn-on-first-worker'") || swarm.includes("rightColumnMode: 'spawn-on-first-worker'"),
  real_geometry_proof: realGeometryProof
}
report.ok = report.initial_main_only
  && report.passes_session_name
  && report.passes_worker_placement
  && report.passes_visible_cap
  && report.worker_uses_right_column
  && (!requireReal || realGeometryProof?.ok === true)
assertGate(report.ok, 'Naruto must use dynamic right-column worker panes in interactive mode', report)
emitGate('naruto:zellij-dynamic-right-column', report)

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
