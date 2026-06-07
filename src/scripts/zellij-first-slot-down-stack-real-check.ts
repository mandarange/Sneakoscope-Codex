#!/usr/bin/env node
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'

const required = process.env.SKS_REQUIRE_ZELLIJ === '1' || process.argv.includes('--require-real')
if (!required) {
  emitGate('zellij:first-slot-down-stack:real', {
    ok: true,
    status: 'skipped',
    reason: 'SKS_REQUIRE_ZELLIJ_not_set'
  })
  process.exit(0)
}
assertGate(false, 'Real Zellij first-slot-down-stack verification requires an operator-run live Zellij session proof', {
  required,
  next: 'Run the release real-check on a host with Zellij available.'
})
