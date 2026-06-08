#!/usr/bin/env node
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'

const mad = readText('src/core/commands/mad-sks-command.ts')
const anchor = readText('src/core/zellij/zellij-slot-column-anchor.ts')
const updateNotice = readText('src/core/update/update-notice.ts')
assertGate(
  mad.includes('checkSksUpdateNotice') && updateNotice.includes('update-notice.json'),
  'MAD Zellij launch must write nonblocking update notice artifact'
)
assertGate(anchor.includes('update-notice.json') && anchor.includes('updateAvailableVersion'), 'Zellij anchor must display update notice state')
emitGate('update:mad-zellij-notice', { artifact: 'update-notice.json' })
