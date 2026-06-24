#!/usr/bin/env node
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'

const ledger = readText('src/core/mad-db/mad-db-ledger.ts')
const cap = readText('src/core/mad-db/mad-db-capability.ts')
assertGate(ledger.includes('mad-db-ledger.jsonl') && cap.includes('mad-db-capability.closed.json'), 'Mad-DB ledger must record lifecycle and closed capability events')
assertGate(!ledger.includes('unknown_pending_tool_result'), 'Mad-DB ledger must not use old pending-latest fallback wording')
emitGate('mad-db:ledger', { file: 'mad-db-ledger.jsonl' })
