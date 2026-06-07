#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'
import { buildNarutoWorkGraph } from '../core/naruto/naruto-work-graph.js'
import { collectActualNarutoWorker, spawnActualNarutoWorker } from '../core/naruto/naruto-real-worker-runtime.js'

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
const ok = collected.ok === true
  && result.ok === true
  && result.control_plane_result?.worker_result_path
  && result.control_plane_result?.structured_output_valid === true
assertGate(ok, 'Naruto actual worker must call Codex Control Plane and write structured result evidence', { collected, result })
emitGate('naruto:actual-worker-control-plane', { collected, result })
