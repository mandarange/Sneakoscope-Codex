#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const renderer = await importDist('core/zellij/zellij-slot-pane-renderer.js')
const text = renderer.renderZellijSlotPane({
  slotId: 'slot-003',
  generationIndex: 2,
  role: 'implementer',
  backend: 'local-llm',
  status: 'coding',
  fastMode: true,
  serviceTier: 'fast',
  provider: 'codex-lb',
  authMode: 'codex_lb_key',
  model: 'gpt-5.5',
  reasoningEffort: 'medium',
  currentFile: 'src/core/foo.ts',
  currentTask: 'Editing Zellij slot pane renderer',
  changedFiles: ['src/core/foo.ts', 'src/core/bar.ts'],
  patchStatus: 'candidate',
  verifyStatus: 'queued',
  heartbeatAgeMs: 2000,
  worktreeId: 'WT-0007',
  eventLines: ['running: tool apply_patch', 'running: file src/core/foo.ts'],
  stdoutTail: ['renderer updated live pane output'],
  mode: 'compact-slots'
})
const lines = text.split(/\n/)
const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-slot-pane-renderer-'))
await fs.writeFile(path.join(artifactDir, 'worker-intake.json'), JSON.stringify({
  agent: { session_id: 'session-slot-003', role: 'implementer' },
  backend: 'codex-sdk',
  fast_mode: true,
  service_tier: 'fast',
  slice: {
    title: 'Hydrate live slot pane from artifacts',
    write_paths: ['src/core/zellij/zellij-slot-pane-renderer.ts']
  },
  worktree: { id: 'WT-0007' }
}, null, 2))
await fs.writeFile(path.join(artifactDir, 'worker-fast-mode.json'), JSON.stringify({
  fast_mode: true,
  service_tier: 'fast'
}, null, 2))
await fs.writeFile(path.join(artifactDir, 'zellij-worker-pane.json'), JSON.stringify({
  provider: 'codex-lb',
  service_tier: 'fast',
  provider_context: {
    provider: 'codex-lb',
    auth_mode: 'codex_lb_key'
  }
}, null, 2))
await fs.writeFile(path.join(artifactDir, 'codex-control-proof.json'), JSON.stringify({
  config: {
    model: 'gpt-5.5',
    model_provider: 'codex-lb',
    service_tier: 'fast',
    model_reasoning_effort: 'medium'
  }
}, null, 2))
await fs.writeFile(path.join(artifactDir, 'worker-heartbeat.jsonl'), `${JSON.stringify({ event: 'started', status: 'running' })}\n`)
await fs.writeFile(path.join(artifactDir, 'codex-sdk-events.jsonl'), `${JSON.stringify({
  sdk_event_type: 'item.completed',
  lane_status: 'running',
  current_tool: 'apply_patch',
  current_file: 'src/core/zellij/zellij-slot-pane-renderer.ts',
  message_tail: null
})}\n`)
await fs.writeFile(path.join(artifactDir, 'worker.stdout.log'), 'renderer stdout tail\n')
const hydrated = await renderer.renderZellijSlotPaneFromArtifacts({
  artifactDir,
  slotId: 'slot-003',
  generationIndex: 2,
  mode: 'compact-slots'
})
await fs.rm(artifactDir, { recursive: true, force: true })
const command = renderer.buildZellijSlotPaneCommand({
  cliPath: '/repo/dist/bin/sks.js',
  missionId: 'M-test',
  slotId: 'slot-003',
  generationIndex: 2,
  artifactDir: '/tmp/worker',
  watch: true
})
const report = {
  schema: 'sks.zellij-slot-pane-renderer-check.v1',
  line_count: lines.length,
  max_compact_lines: 17,
  contains_slot: /LIVE SLOT slot-003/.test(text) && /slot: slot-003 \/ gen-2/.test(text),
  contains_status: /coding/.test(text),
  contains_runtime: /runtime: fast on/.test(text) && /model: gpt-5\.5/.test(text) && /provider: codex-lb/.test(text),
  contains_files: /src\/core\/foo\.ts/.test(text) && /src\/core\/bar\.ts/.test(text),
  contains_live_event: /event: running:/.test(text),
  artifact_hydrates_runtime: /runtime: fast on/.test(hydrated) && /model: gpt-5\.5/.test(hydrated) && /reasoning: medium/.test(hydrated) && /auth: codex_lb_key/.test(hydrated),
  artifact_hydrates_live_event: /tool apply_patch/.test(hydrated) && /renderer stdout tail/.test(hydrated),
  artifact_hydrates_planned_file: /zellij-slot-pane-renderer\.ts/.test(hydrated),
  command_uses_slot_pane: command.includes('zellij-slot-pane') && command.includes('--watch'),
  snapshot: text,
  hydrated_snapshot: hydrated
}
assertGate(lines.length <= 17 && report.contains_slot && report.contains_status && report.contains_runtime && report.contains_files && report.contains_live_event && report.artifact_hydrates_runtime && report.artifact_hydrates_live_event && report.artifact_hydrates_planned_file && report.command_uses_slot_pane, 'compact slot pane renderer must render one live work pane per slot', report)
emitGate('zellij:compact-slot-renderer', report)
