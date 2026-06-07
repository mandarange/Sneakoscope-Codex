#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'
import { buildNarutoWorkGraph } from '../core/naruto/naruto-work-graph.js'
import { collectActualNarutoWorker, spawnActualNarutoWorker } from '../core/naruto/naruto-real-worker-runtime.js'
import { narutoCommand } from '../core/commands/naruto-command.js'

process.env.SKS_CODEX_SDK_FAKE = '1'
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-naruto-actual-worker-'))
const graph = buildNarutoWorkGraph({ requestedClones: 1, totalWorkItems: 1, readonly: true, writeCapable: false })
const item = graph.work_items[0]
const handle = await spawnActualNarutoWorker({
  root,
  missionId: `M-naruto-actual-worker-${process.pid}`,
  item,
  placement: { placement: 'headless', visible_index: null, reason: 'check' },
  backend: 'fake',
  visiblePaneCap: 0
})
const collected = await collectActualNarutoWorker(handle)
const result = JSON.parse(fs.readFileSync(path.join(handle.worker_artifact_dir, 'worker-result.json'), 'utf8'))
const fullRoute = await narutoCommand([
  'run',
  'Naruto actual worker full command control plane check',
  '--json',
  '--backend',
  'fake',
  '--backend-explicit',
  '--clones',
  '2',
  '--work-items',
  '2',
  '--readonly',
  '--no-open-zellij',
  '--smoke'
])
const missionRoot = path.join(process.cwd(), '.sneakoscope', 'missions', fullRoute.mission_id || '', 'agents', 'naruto-real-workers')
const fullWorkerResults = fs.existsSync(missionRoot)
  ? fs.readdirSync(missionRoot).map((name) => {
    const file = path.join(missionRoot, name, 'worker-result.json')
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
  }).filter(Boolean)
  : []
const ok = collected.ok === true
  && result.ok === true
  && result.control_plane_result?.worker_result_path
  && result.control_plane_result?.structured_output_valid === true
  && fullRoute.active_pool?.real_runtime?.runtime_source_of_truth === 'pre_run_smoke_only'
  && fullRoute.runtime_source_of_truth === 'agent-orchestrator-scheduler'
  && fullWorkerResults.length >= 1
  && fullWorkerResults.every((row) => row.control_plane_result?.structured_output_valid === true)
assertGate(ok, 'Naruto actual worker must call Codex Control Plane directly and through the explicit full-route smoke path', { collected, result, fullRoute, fullWorkerResults })
emitGate('naruto:actual-worker-control-plane', { collected, result, full_route_mission_id: fullRoute.mission_id, full_worker_result_count: fullWorkerResults.length })
