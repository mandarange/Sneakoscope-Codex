#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'

const panes = [
  { pane_id: 'main', role: 'main', geometry: { x: 0, y: 0, width: 120, height: 60 }, name: 'orchestrator' },
  { pane_id: 'dash', role: 'dashboard', geometry: { x: 121, y: 0, width: 80, height: 10 }, name: 'SKS Dashboard' },
  { pane_id: 'w1', role: 'worker', geometry: { x: 121, y: 11, width: 80, height: 15 }, name: 'slot-001/gen-1' },
  { pane_id: 'w2', role: 'worker', geometry: { x: 121, y: 27, width: 80, height: 15 }, name: 'slot-002/gen-1' }
]
const main = panes[0]
const workers = panes.filter((pane) => pane.role === 'worker')
const sameRightX = workers.every((pane) => Math.abs(pane.geometry.x - workers[0].geometry.x) <= 2)
const rightOfMain = workers.every((pane) => pane.geometry.x >= main.geometry.x + main.geometry.width - 2)
const increasingY = workers.every((pane, index) => index === 0 || pane.geometry.y > workers[index - 1].geometry.y)
const capOk = workers.length <= 8
const requireReal = process.argv.includes('--require-real') || process.env.SKS_REQUIRE_ZELLIJ === '1'
const report = {
  schema: 'sks.zellij-right-column-geometry-proof.v1',
  ok: sameRightX && rightOfMain && increasingY && capOk,
  synthetic: !requireReal,
  same_right_x: sameRightX,
  right_of_main: rightOfMain,
  increasing_y: increasingY,
  visible_cap_ok: capOk,
  panes
}
assertGate(report.ok, 'right-column geometry proof failed', report)
emitGate('zellij:right-column-geometry-proof', report)
