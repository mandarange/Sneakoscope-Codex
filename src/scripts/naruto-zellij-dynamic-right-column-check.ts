#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import path from 'node:path'
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.js'

const naruto = fs.readFileSync(path.join(root, 'src/core/commands/naruto-command.ts'), 'utf8')
const worker = fs.readFileSync(path.join(root, 'src/core/zellij/zellij-worker-pane-manager.ts'), 'utf8')
const swarm = fs.readFileSync(path.join(root, 'src/core/agents/native-cli-session-swarm.ts'), 'utf8')
const report = {
  schema: 'sks.naruto-zellij-dynamic-right-column-check.v1',
  ok: true,
  initial_main_only: /slotCount:\s*0/.test(naruto),
  passes_session_name: naruto.includes('zellijSessionName: liveZellij?.session_name'),
  passes_worker_placement: naruto.includes("workerPlacement: parsed.json || parsed.noOpenZellij ? 'process' : 'zellij-pane'"),
  passes_visible_cap: naruto.includes('zellijVisiblePaneCap: zellijVisiblePanes'),
  worker_uses_right_column: worker.includes("rightColumnMode: 'spawn-on-first-worker'") || swarm.includes("rightColumnMode: 'spawn-on-first-worker'")
}
report.ok = report.initial_main_only && report.passes_session_name && report.passes_worker_placement && report.passes_visible_cap && report.worker_uses_right_column
assertGate(report.ok, 'Naruto must use dynamic right-column worker panes in interactive mode', report)
emitGate('naruto:zellij-dynamic-right-column', report)
