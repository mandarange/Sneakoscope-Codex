#!/usr/bin/env node
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'
import { buildZellijSlotColumnAnchorCommand, renderZellijSlotColumnAnchor } from '../core/zellij/zellij-slot-column-anchor.js'

const rendered = renderZellijSlotColumnAnchor({
  activeWorkers: 3,
  visiblePaneCap: 8,
  headlessWorkers: 12,
  queueDepth: 44,
  mode: 'compact-slots'
})
const roster = renderZellijSlotColumnAnchor({
  activeWorkers: 1,
  visiblePaneCap: 5,
  headlessWorkers: 0,
  queueDepth: 0,
  mode: 'compact-slots',
  workerRows: [
    {
      slotId: 'slot-004',
      generationIndex: 1,
      placement: 'zellij-pane',
      status: 'running',
      backend: 'codex-sdk',
      task: 'Inspect Zellij slot UI assignment',
      heartbeatAgeMs: 900
    }
  ]
})
const command = buildZellijSlotColumnAnchorCommand({
  nodePath: '/usr/bin/node',
  cliPath: '/repo/dist/bin/sks.js',
  missionId: 'M-check',
  mode: 'compact-slots',
  artifactRoot: '/repo/.sneakoscope/missions/M-check/agents',
  watch: true
})
const ok = rendered === 'SLOTS active 3/8 · headless 12 · q 44'
  && roster.includes('SLOTS active 1/5 · headless 0 · q 0')
  && roster.includes('slot-004 g1 running codex-sdk')
  && roster.includes('Inspect Zellij slot UI assignment')
  && command.includes('zellij-slot-column-anchor')
  && command.includes('--watch')
assertGate(ok, 'Zellij slot-column anchor must render compact SLOTS header plus live worker rows and build the CLI command', { rendered, roster, command })
emitGate('zellij:slot-column-anchor', { rendered, roster, command })
