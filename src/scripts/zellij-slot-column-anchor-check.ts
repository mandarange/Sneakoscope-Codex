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
const command = buildZellijSlotColumnAnchorCommand({
  nodePath: '/usr/bin/node',
  cliPath: '/repo/dist/bin/sks.js',
  missionId: 'M-check',
  mode: 'compact-slots',
  artifactRoot: '/repo/.sneakoscope/missions/M-check/agents',
  watch: true
})
const ok = rendered === 'SLOTS active 3/8 · headless 12 · q 44'
  && command.includes('zellij-slot-column-anchor')
  && command.includes('--watch')
assertGate(ok, 'Zellij slot-column anchor must render one compact SLOTS line and build the CLI command', { rendered, command })
emitGate('zellij:slot-column-anchor', { rendered, command })
