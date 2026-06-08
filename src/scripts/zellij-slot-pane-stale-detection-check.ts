#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { slotTelemetrySnapshotPath } from '../core/zellij/zellij-slot-telemetry.js'
import { renderZellijSlotPaneFromArtifacts, renderZellijSlotPaneStatusFromArtifacts } from '../core/zellij/zellij-slot-pane-renderer.js'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-zellij-stale-'))
const missionId = 'M-zellij-stale'
const file = slotTelemetrySnapshotPath(root, missionId)
await fs.mkdir(path.dirname(file), { recursive: true })
const snapshot = {
  schema: 'sks.zellij-slot-telemetry-snapshot.v1',
  mission_id: missionId,
  updated_at: new Date().toISOString(),
  flush_count: 1,
  slots: {
    'slot-001:g1': {
      slot_id: 'slot-001',
      generation_index: 1,
      worker_id: 'worker-001',
      status: 'running',
      role: 'worker',
      backend: 'fixture',
      provider: 'fixture',
      service_tier: 'fast',
      worktree_id: null,
      worktree_path: null,
      task_title: 'stale detection fixture',
      current_file: null,
      latest_event_type: 'task_started',
      latest_ts: new Date().toISOString(),
      progress: null,
      artifact_paths: [],
      blockers: [],
      log_tail: ''
    }
  },
  counts: { queued: 0, running: 1, verifying: 0, completed: 0, failed: 0, headless: 0 }
}
snapshot.updated_at = new Date(Date.now() - 3500).toISOString()
await fs.writeFile(file, `${JSON.stringify(snapshot)}\n`, 'utf8')
const staleText = await renderZellijSlotPaneFromArtifacts({ artifactDir: root, artifactRoot: root, missionId, slotId: 'slot-001', generationIndex: 1 })
const staleStatus = await renderZellijSlotPaneStatusFromArtifacts({ artifactDir: root, artifactRoot: root, missionId, slotId: 'slot-001', generationIndex: 1 })
assertGate(/telemetry stale 3\.\d+s/.test(staleText), 'slot pane must show 3s stale telemetry warning', { staleText, staleStatus })
assertGate(staleStatus.telemetry_stale === true && staleStatus.telemetry_age_ms >= 3000, 'slot pane status JSON must expose stale telemetry', staleStatus)

snapshot.updated_at = new Date(Date.now() - 11000).toISOString()
await fs.writeFile(file, `${JSON.stringify(snapshot)}\n`, 'utf8')
const blockedText = await renderZellijSlotPaneFromArtifacts({ artifactDir: root, artifactRoot: root, missionId, slotId: 'slot-001', generationIndex: 1 })
assertGate(blockedText.includes('telemetry stale; worker may still be running'), 'slot pane must show >10s stale blocker line', { blockedText })
emitGate('zellij:slot-pane-stale-detection', { stale_age_ms: staleStatus.telemetry_age_ms })
