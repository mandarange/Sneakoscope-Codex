#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { packageRoot } from '../core/fsx.js'
import {
  buildWorkerPaneArtifact,
  evaluateZellijWorkerPaneSpawnOrder,
  isRealZellijWorkerPaneIdSource
} from '../core/zellij/zellij-worker-pane-manager.js'

const root = packageRoot()
const source = await fs.readFile(path.join(root, 'src', 'core', 'zellij', 'zellij-worker-pane-manager.ts'), 'utf8')
const artifact = buildWorkerPaneArtifact({
  root,
  missionId: 'M-worker-pane-manager',
  sessionName: 'sks-M-worker-pane-manager',
  slotId: 'slot-001',
  generationIndex: 7,
  sessionId: 'slot-001-gen-7',
  workerArtifactDir: 'sessions/slot-001/gen-7/worker',
  resultPath: 'sessions/slot-001/gen-7/worker/worker-result.json',
  heartbeatPath: 'sessions/slot-001/gen-7/worker/worker-heartbeat.jsonl',
  patchEnvelopePath: 'sessions/slot-001/gen-7/worker/worker-patch-envelope.json',
  stdoutLog: 'sessions/slot-001/gen-7/worker/worker.stdout.log',
  stderrLog: 'sessions/slot-001/gen-7/worker/worker.stderr.log',
  paneId: '42',
  paneIdSource: 'zellij_worker_new_pane_stdout',
  providerContext: {
    schema: 'sks.provider-context.v1',
    generated_at: new Date().toISOString(),
    provider: 'codex-lb',
    auth_mode: 'codex_lb_key',
    route: '$Naruto',
    service_tier: 'fast',
    source: 'codex_lb',
    confidence: 'high',
    conflict: false,
    warnings: [],
    signals: {
      openai_api_key_present: false,
      codex_lb_key_present: true,
      codex_lb_explicit: true,
      codex_app_auth_present: false,
      model_provider: 'codex-lb'
    }
  },
  serviceTier: 'fast',
  sdkThreadId: 'sdk-thread-7',
  sdkRunId: 'sdk-run-7',
  streamEventCount: 4,
  structuredOutputValid: true,
  status: 'running',
  blockers: []
})
const spawnOrder = evaluateZellijWorkerPaneSpawnOrder([
  { event_type: 'session_launch_started' },
  { event_type: 'zellij_worker_pane_created' },
  { event_type: 'worker_started' },
  { event_type: 'codex_sdk_thread_started' },
  { event_type: 'result_written' },
  { event_type: 'pane_closed' }
])
const syntheticRejected = !isRealZellijWorkerPaneIdSource('synthetic_layout_pending_proof')
  && !isRealZellijWorkerPaneIdSource('zellij_worker_pane_stdout_missing')
const sourceOk = source.includes("action', 'new-pane'")
  && source.includes("'--direction', 'right'")
  && source.includes("'--name', paneName")
  && source.includes("'--', 'sh', '-lc'")
  && source.includes('zellij_worker_new_pane_stdout')
  && source.includes('zellij_worker_list_panes')
  && source.includes('provider_context')
const ok = artifact.ok
  && artifact.pane_name === 'slot-001/gen-7 · codex-sdk · fast · codex-lb'
  && artifact.pane_kind === 'worker_codex_sdk'
  && artifact.provider === 'codex-lb'
  && artifact.service_tier === 'fast'
  && artifact.direction_requested === 'right'
  && artifact.direction_applied === 'not_applied'
  && artifact.sdk_thread_id === 'sdk-thread-7'
  && artifact.stream_event_count === 4
  && artifact.scaling_primitive === 'native_cli_process_in_zellij_worker_pane'
  && syntheticRejected
  && spawnOrder.ok
  && sourceOk
emit({ schema: 'sks.zellij-worker-pane-manager-check.v1', ok, artifact, synthetic_rejected: syntheticRejected, spawn_order: spawnOrder, source_ok: sourceOk, blockers: ok ? [] : ['zellij_worker_pane_manager_contract_failed'] })

function emit(report: Record<string, unknown>) {
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exitCode = 1
}
