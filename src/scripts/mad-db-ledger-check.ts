#!/usr/bin/env node
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'

const ledger = readText('src/core/mad-db/mad-db-ledger.ts')
const cap = readText('src/core/mad-db/mad-db-capability.ts')
assertGate(ledger.includes('mad-db-ledger.jsonl') && cap.includes('capability.consumed'), 'Mad-DB ledger must record lifecycle and consumption events')
emitGate('mad-db:ledger', { file: 'mad-db-ledger.jsonl' })
