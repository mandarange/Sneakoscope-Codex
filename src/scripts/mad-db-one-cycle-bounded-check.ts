#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { closeMadDbCycle, createMadDbCapability, MAD_DB_ACK, readMadDbCapability } from '../core/mad-db/mad-db-capability.js'
import { checkDbOperation } from '../core/db-safety.js'
import { assertGate, emitGate } from './sks-1-18-gate-lib.js'
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-mad-db-bounded-'))
const missionId = 'M-mad-db-bounded'
process.env.SKS_MAD_DB_MAX_OPERATIONS = '2'
const cap = await createMadDbCapability(root, { missionId, ack: MAD_DB_ACK, ttlMs: 60000 })
assertGate(cap.max_operations >= 2 && cap.operation_count === 0, 'capability must start as bounded one-cycle', cap)
const payload = { tool_name: 'supabase.execute_sql', sql: 'update users set flag = true where id = 1' }
const first = await checkDbOperation(root, { mission_id: missionId }, payload)
const afterFirst = await readMadDbCapability(root, missionId)
assertGate(first.allowed === true && afterFirst.operation_count === 1 && afterFirst.consumed === false, 'capability must remain active after operation 1 when max_operations > 1', { first, afterFirst })
const second = await checkDbOperation(root, { mission_id: missionId }, payload)
const afterSecond = await readMadDbCapability(root, missionId)
assertGate(second.allowed === true && afterSecond.operation_count === 2 && afterSecond.consumed === true, 'capability must be consumed when operation_count reaches max_operations', { second, afterSecond })

const closeMissionId = 'M-mad-db-close-cycle'
process.env.SKS_MAD_DB_MAX_OPERATIONS = '20'
const closeCap = await createMadDbCapability(root, { missionId: closeMissionId, ack: MAD_DB_ACK, ttlMs: 60000 })
const closed = await closeMadDbCycle(root, closeMissionId, closeCap.cycle_id)
assertGate(closed?.consumed === true && closed?.consumed_by === 'mad-db-cycle-close', 'explicit cycle close must consume active capability', closed)
emitGate('mad-db:one-cycle-bounded', { cycle_id: cap.cycle_id, operation_count: afterSecond.operation_count, max_operations: afterSecond.max_operations, close_cycle: closed?.consumed === true })
