#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const renderer = await importDist('core/zellij/zellij-slot-pane-renderer.js')
const text = renderer.renderZellijSlotPane({
  slotId: 'slot-003',
  generationIndex: 2,
  role: 'implementer',
  backend: 'local-llm',
  status: 'coding',
  currentFile: 'src/core/foo.ts',
  patchStatus: 'candidate',
  verifyStatus: 'queued',
  heartbeatAgeMs: 2000,
  worktreeId: 'WT-0007',
  mode: 'compact-slots'
})
const lines = text.split(/\n/)
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
  max_compact_lines: 5,
  contains_slot: /slot-003 gen-2/.test(text),
  contains_status: /status: coding/.test(text),
  command_uses_slot_pane: command.includes('zellij-slot-pane') && command.includes('--watch'),
  snapshot: text
}
assertGate(lines.length <= 5 && report.contains_slot && report.contains_status && report.command_uses_slot_pane, 'compact slot pane renderer must stay within five lines', report)
emitGate('zellij:compact-slot-renderer', report)
