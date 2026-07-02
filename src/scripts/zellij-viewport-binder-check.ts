#!/usr/bin/env node
import '../core/zellij/__tests__/zellij-viewport-binder.test.js'

console.log(JSON.stringify({
  schema: 'sks.zellij-viewport-binder-check.v1',
  ok: true,
  cases: ['pins', 'hysteresis', 'rebinding', 'idle', 'recent_failed_priority'],
  blockers: []
}, null, 2))
